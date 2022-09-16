import express from 'express';
import { users } from '../app.js';
import g from '../globals.js';

const router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  if (req.session.user) {
    res.render('index', {title: 'Express'});
  }
  else {
    res.render('login');
  }
});

router.post('/login', (req,res) => {
  let user = req.body.user;
  let pass = req.body.pass;
  let hashpass = g.hashit(pass);
  users.findOne({name: user, hashpass: hashpass}).then((found) => {
    req.session.user = found;
    res.redirect('/');
  })
  res.render('login', {fail: true})
});

export default router;
