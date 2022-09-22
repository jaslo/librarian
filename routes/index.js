import express from 'express';
import g from '../globals.js';
import path from 'path';
import fs from 'fs';
import util from 'util';

const router = express.Router();

/* GET home page. */
router.get('/', (req, res) => {
  if (req.session.user) {
    if (req.session.user.name == 'uploader') {
      res.render('upload');
    }
    let p = req.query.newfiles ?
        // g.files.find({_id: {$nin: req.session.user.downloads}}) :
        g.files.find({dlusers: { $in: [ req.session.user._id]}}):
        g.files.find();
    p.then((finds) => {
      res.render('library', {files: finds});
    });
  } else {
    res.render('login');
  }
});

router.get('/upload', (req,res) => {
  res.render('upload');
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

    for (let count = 1; ; count++) {
      let filename = req.body['filename' + count];
      if (!filename) break;
      let filenumber = req.body['filenumber' + count];
      let docname = req.body['docname' + count];
      filemap[filename] = {
        filenumber: filenumber,
        docname: docname
      };
    }

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
      }
      catch(e) {
        console.log('error ' + e + ' processing file');
      }
    });
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
