import express from 'express';
import g from '../globals.js';
import path from 'path';
import fs from 'fs';
import util from 'util';
import {ObjectID as ObjectId} from 'mongodb';

const router = express.Router();

/* GET home page. */
router.get('/', (req, res) => {
  if (req.session.user) {
    if (req.session.user.name == 'uploader') {
      res.render('upload');
    } else {
      showLibrary(req,res);
    }
  } else {
    res.render('login');
  }
});

function showLibrary(req,res) {
  g.files.find({}, {
    projection: {_id: 0, idstr: {$toString:"$_id"}, name: 1, filenumber: 1, docname: 1, downloads: {$elemMatch: { $eq: req.session.user.id}}},
    sort: {filenumber: 1, docname: 1}
  }).toArray().then((finds) => {
    res.render('library', {files: finds});
  });
}
router.get('/upload', (req,res) => {
  res.render('upload');
});

router.get('/download/:id', (req, res) => {
  const id = req.params.id;
  g.files.findOneAndUpdate({_id: new ObjectId(id)},
  {$addToSet: {downloads: req.session.user._id}},
      {returnDocument: "before"}).
  then((fdoc) => {
    res.download(fdoc.value.urlpath, fdoc.value.name, (err) => {
      if (!err) {
        res.status(200).end();
      }
      else res.status(500).end();
    })
  });
});

router.post('/upload', (req, res) => {
  /*
  if (req.busboy) {
    req.busboy.on('file', (name, file, info) => {
      const { filename, encoding, mimeType } = info;
      const saveTo = path.join(g.uploadDir, filename);
      console.log('write file to path ' + saveTo);
      file.pipe(fs.createWriteStream(saveTo));
    });
    req.busboy.on('field', (name, val, info) => {
      console.log(`Field [${name}]: value: %j`, val);
    });
    req.busboy.on('close', () => {
      res.writeHead(200, { 'Connection': 'close' });
      res.end(`That's all folks!`);
    });
//    req.pipe(req.busboy);
*/
  if (req.files && req.files.formFiles) {
    if (!Array.isArray(req.files.formFiles)) {
      req.files.formFiles = [req.files.formFiles];
    }

    let filemap = {};

    let count = 1;
    for (count = 1; ; count++) {
      let filename = req.body['filename' + count];
      if (!filename) break;
      let filenumber = req.body['filenumber' + count];
      let docname = req.body['docname' + count];
      filemap[filename] = {
        filenumber: filenumber,
        docname: docname
      };
    }

    let updated = 0;

    req.files.formFiles.forEach(async (ff) => {
      try {
        let orig = ff.file;
        let newpath = g.publicDir + 'files/' + ff.filename;
        await new Promise((resolve, reject) => {
            fs.rename(orig, newpath, (data, err) => {
              if (!err) resolve(data);
              else throw(err);
            });
        });
        let webpath = g.publicDir + 'files/' + ff.filename;
        console.log('dlpath = ' + webpath);
        // find the corresponding fields in req.body
        let fmeta = filemap[ff.filename];
        if (!fmeta) throw "missing metadata";
        await g.files.findOneAndUpdate(
            {urlpath: webpath},
            {
              $set: {
                name: ff.filename,
                filenumber: fmeta.filenumber,
                docname: fmeta.docname || ff.filename,
                urlpath: webpath,
                downloads: []
              }
            },
            {upsert: true, returnNewDocument: true}
        );
        updated++;
        if (updated == count-1) {
          res.redirect('/');
        }
      }
      catch(e) {
        console.log('error ' + e + ' processing file');
      }
    });
  }
  else {
    showLibrary(req,res);
  }
});

router.post('/login', (req,res) => {
  let user = req.body.user;
  let pass = req.body.pass;
  g.hashit(pass).then((hashpass) => {
    g.users.findOne({name: user, hashpass: hashpass}).then((found) => {
      if (found) {
        req.session.user = found;
        res.redirect('/');
      } else {
        res.render('login', {fail: true})
      }
    })
  })
});

export default router;
