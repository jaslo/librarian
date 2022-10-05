import express from 'express';
import g from '../globals.js';
import path from 'path';
import fs from 'fs';
import util from 'util';
import {ObjectID as ObjectId} from 'mongodb';
import nodemailer from 'nodemailer';
import aws from '@aws-sdk/client-ses';
import bcrypt from "bcrypt";

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

process.env.AWS_ACCESS_KEY_ID = g.awsaccess;
process.env.AWS_SECRET_ACCESS_KEY = g.awssecret;
const ses = new aws.SES({
  apiVersion: "2010-12-01",
  region: "us-east-1",
});
let transporter = nodemailer.createTransport({
  SES: { ses, aws },
});

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
  await adduser1(user, pass, req.body.verified, true);
  res.redirect('/')
}

async function adduser1(user, pass, verified, reset) {
  const hash = await bcrypt.hash(pass, 10);
  // upsert to the users collection
  let update = {$set: {
    hashpass: hash,
    verified: verified,
    upload: false,
  }};

  if (reset) {
    update.$set.downloads = [];
  }
  let userRecord = await g.users.findOneAndUpdate(
      {name: user},
      update,
      {upsert: true, returnDocument: "after"}
  );
  if (reset) {
    await g.files.updateMany({downloads: {$elemMatch: {$eq: req.session.user._id}}},
        {$pull: {downloads: {$eq: userRecord._id}}}
    );
  }
  return userRecord;
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
              res.download(g.fileStorageDir + fdoc0.value.urlpath, fdoc0.value.name, {maxAge: 0, lastModified: 0}, (err) => {
                if (!err) {
                  res.status(200).end();
                } else res.status(500).end();
              });
            });
      });
}

async function addEntry(req, res) {
  await g.files.findOneAndUpdate(
      {docname: req.body.docname},
      {
        $set: {
          name: req.body.docname,
          filenumber: req.body.filenumber,
          docname: req.body.docname,
          downloads: []
        }
      },
      {upsert: true, returnNewDocument: true}
  );
  res.redirect('/');
}

async function addNames(req, res) {
  const fdoc = 'name';
  const fnum = 'number';

  let count = 1;
  for (count = 1; ; count++) {
    let docname = req.body[fdoc + count];
    if (!docname) break;
    let filenumber = req.body[fnum + count];
    await g.files.findOneAndUpdate(
        {docname: docname},
        {
          $set: {
            filenumber: filenumber,
            docname: docname,
            downloads: []
          }
        },
        {upsert: true, returnNewDocument: true}
    );
  }
}

async function uploadFiles(req, res) {
  if (req.body.uploads == "names") {
    await addNames(req,res);
    res.redirect('/');
    return;
  }

  if (!Array.isArray(req.files.formFiles)) {
    req.files.formFiles = [req.files.formFiles];
  }

  const fdoc = "docname";
  const fnum = "filenumber";

  let filemap = {};

  let count = 1;
  for (count = 1; ; count++) {
    let docname = req.body[fdoc + count];
    if (!docname) break;
    let filename = req.body['filename' + count] || docname;
    let filenumber = req.body[fnum + count];
    filemap[filename] = {
      filenumber: filenumber,
      docname: docname
    };
  }
  let updated = 0;
  if (req.files.formfiles) {
    for (const ff of req.files.formFiles) {
      try {
        let orig = ff.file;
        let newpath = g.fileStorageDir + ff.filename;
        await new Promise((resolve, reject) => {
          fs.rename(orig, newpath, (data, err) => {
            if (!err) resolve(data);
            else throw(err);
          });
        });
        let webpath = g.fileStorageDir + ff.filename;
        console.log('dlpath = ' + webpath);
        // find the corresponding fields in req.body
        let fmeta = filemap[ff.filename];
        if (!fmeta) throw "missing metadata";
        await g.files.findOneAndUpdate(
            {docname: fmeta.docname},
            {
              $set: {
                name: ff.filename,
                filenumber: fmeta.filenumber,
                docname: fmeta.docname || ff.filename,
                urlpath: ff.filename,
                downloads: []
              }
            },
            {upsert: true, returnNewDocument: true}
        );
        updated++;
        if (updated == count - 1) {
          res.redirect('/');
        }
      } catch (e) {
        console.log('error ' + e + ' processing file');
      }
    }
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
      let ret = await adduser1(user, pass, true, req.body.reset);
      // use email loop?
      /*
      transporter.sendMail({
        from: 'librarian@vtable.com',
        to: req.body.username,
        subject: 'Complete your sign up',
        html: `Hello,<br/>
          Someone using this email has just signed up for "librarian". 
          <br/>
          If that was your intention, please use 
          <a href="${req.headers.origin}/verify/${ret.value._id.toString()}">this link</a> 
          to complete your sign up.<br/>
          Otherwise, ignore this message!
          `
      });
      */
      req.session.user = ret.value;
      res.redirect('/');
      return;
    }
  }
  if (!user || !pass) {
    res.render('login', {fail: "email and password must be provided"});
    return;
  }
  let found;
  g.users.findOne({name: user}).then((found0) => {
    found = found0;
    if (!found) throw new Error("could not find user")
    if (!found.verified) throw new Error("user has not been verified");
    return bcrypt.compare(pass, found.hashpass);
  }).then((result) => {
    req.session.user = found;
    res.redirect('/');
  })
  .catch((e) => {
    res.render('login', {fail: e});
  });
}
