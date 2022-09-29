import express from 'express';
import g from '../globals.js';
import path from 'path';
import fs from 'fs';
import util from 'util';
import {ObjectID as ObjectId} from 'mongodb';

const router = g.router;

export function setRoutes(router) {
  router.get('/', home);
  router.get('/logout', logout);
  router.post('/adduser', adduser);
  router.get('/upload', upload);
  router.get('/download/:id', downloadFile);
  router.post('/upload', uploadFiles);
  router.post('/login', login);
}

/* GET home page. */
function home(req, res) {
  if (req.session.user) {
    if (req.session.user.name == 'uploader') {
      res.render('upload');
    } else if (req.session.user.name == 'admin') {
      showUsers(req,res);
    } else {
      showLibrary(req,res);
    }
  } else {
    res.render('login',{fail: false});
  }
}

function showUsers(req,res) {
  g.users.find({}, {
    projection: {_id: 0, idstr: {$toString:"$_id"}, name: 1, verified: 1, upload: 1, downloads: {$size: "$downloads"}},
    sort: {name: 1}
  }).toArray().then((users) => {
    res.render('users', {users: users});
  });
}


function logout(req, res) {
  req.session.user = null;
  req.session.save(() => {
    req.session.regenerate(() => {
      res.redirect('/');
    });
  });
}

async function adduser(req,res) {
  let user = req.body.username;
  let pass = req.body.pass;
  await adduser1(user, pass);
  res.redirect('/')
}

async function adduser1(user, pass) {
  const hash = await g.hashit(pass);
// upsert to the users collection
  return g.users.findOneAndUpdate(
      {name: user},
      {$set: {
          hashpass: hash,
          verified: true,
          upload: false,
          downloads: []
        }},
      {upsert: true, returnDocument: "after"}
  );
}

function showLibrary(req,res) {
  g.files.find({}, {
    projection: {_id: 0, idstr: {$toString:"$_id"}, name: 1, filenumber: 1, docname: 1, downloads: {$elemMatch: { $eq: req.session.user._id}}},
    sort: {filenumber: 1, docname: 1}
  }).toArray().then((finds) => {
    res.render('library', {files: finds, flags: req.query.flags});
  });
}

function upload(req,res) {
  res.render('upload');
}

function downloadFile(req, res, next) {
  const id = req.params.id;
  let fdoc0;
  g.files.findOneAndUpdate({_id: new ObjectId(id)},
  {$addToSet: {downloads: req.session.user._id}},
      {returnDocument: "before"}, (err, fdoc) => {
        fdoc0 = fdoc;
        g.users.findOneAndUpdate(
            {_id: new ObjectId(req.session.user._id)},
            {$addToSet: {downloads: id}},
            {returnDocument: "before"}, (err, retuser) => {

              // res.sendFile(fdoc0.value.urlpath, (err) => {
              res.download(fdoc0.value.urlpath, fdoc0.value.name, {maxAge: 0, lastModified: 0}, (err) => {
                if (!err) {
                  res.status(200).end();
                } else res.status(500).end();
              });
            });
      });
}

function uploadFiles(req, res) {
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
}

async function login(req,res) {
  let user = req.body.username;
  let pass = req.body.pass;

  if (req.body.signin == "signup") {
    if (req.body.code != g.secretCode) {
      res.render('login', {fail: "Incorrect signup code"});
      return;
    } else {
        let ret = await adduser1(user, pass);
        req.session.user = ret.value;
        res.redirect('/');
        return;
    }
  }
  if (!user || !pass) {
    res.render('login', {fail: "email and password must be provided"});
    return;
  }
  g.hashit(pass).then((hashpass) => {
    g.users.findOne({name: user, hashpass: hashpass}).then((found) => {
      if (found) {
        req.session.user = found;
        res.redirect('/');
      } else {
        res.render('login', {fail: "Incorrect email/password"})
      }
    })
  })
}
