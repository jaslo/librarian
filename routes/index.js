import express from 'express';
import g from '../globals.js';

const router = express.Router();

/* GET home page. */
router.get('/', (req, res) => {
  if (req.session.user) {
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
})

render.get('/upload', (req,res) => {
  res.render('upload');
});

render.post('/upload', (req, res) => {
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
