import g from '../globals.js';
import {uploadFiles, downloadFile, toggleFile } from './filehandler.js';
import {login, logout, adduser, verify, newPassPage, changePassRequest, setNewPassword} from './users.js';

export function setRoutes(router) {
  router.get('/', home);
  router.get('/logout', logout);
  router.post('/adduser', adduser);
  router.get('/upload', upload);
  router.get('/download/:id', downloadFile);
  router.post('/upload', uploadFiles);
  router.post('/login', login);
  router.get('/verify/:id', verify);
  router.get('/toggle/:id', toggleFile);
  router.get('/changepass/:id', newPassPage);
  router.post('/changepass', changePassRequest);
  router.post('/newpass', setNewPassword);
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

function upload(req,res) {
  res.render('upload');
}

function showLibrary(req,res) {
  g.files.find({}, {
    projection: {_id: 0, idstr: {$toString:"$_id"}, name: 1, filenumber: 1, docname: 1, downloads: {$elemMatch: { $eq: req.session.user._id}}},
    sort: {filenumber: 1, docname: 1}
  }).toArray().then((finds) => {
    res.render('library', {files: finds, flags: req.query.flags});
  });
}

