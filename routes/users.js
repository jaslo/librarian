import g from "../globals.js";
import bcrypt from "bcrypt";
import {ObjectID as ObjectId} from "mongodb";

function showUsers(req,res) {
    g.users.find({}, {
        projection: {_id: 0, idstr: {$toString:"$_id"}, name: 1, verified: 1, upload: 1, downloads: {$size: "$downloads"}},
        sort: {name: 1}
    }).toArray().then((users) => {
        res.render('users', {users: users});
    });
}

export function logout(req, res) {
    req.session.user = null;
    req.session.save(() => {
        req.session.regenerate(() => {
            res.redirect('/');
        });
    });
}

export function verify(req, res) {
    const id = req.params.id;
    g.users.findOneAndUpdate({_id: new ObjectId(id)},
        {$set: {verified: true}}).then(() => {
        res.redirect('/');
    });
}

export async function adduser(req,res) {
    let user = req.body.username;
    let pass = req.body.pass;
    await adduser1(user, pass, req.body.verified == "on", true);
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

function verificationEmail(req,idstr) {
    return `Hello,<br/>
      Someone using this email has just signed up for "librarian". 
      <br/>
      If that was your intention, please use 
      <a href="${req.headers.origin}/verify/${idstr}">this link</a> 
      to complete your sign up.<br/>
      Otherwise, ignore this message!
    `;
}

export async function login(req,res) {
    let user = req.body.username;
    let pass = req.body.pass;
    let verifyError = `You must verify your account from the email you were sent at ${user}.`;

    if (req.body.signin == "signup") {
        if (req.body.code != g.secretCode) {
            res.render('login', {fail: "Incorrect signup code"});
            return;
        } else {
            let ret = await adduser1(user, pass, false, req.body.reset == "on");
            // use email loop?

            g.transporter.sendMail({
                from: 'librarian@vtable.com',
                to: user,
                subject: 'Complete your sign up',
                html: verificationEmail(req,ret.value._id.toString())
            });

            res.render('login', {fail: verifyError});
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
        if (!found.verified) throw new Error(verifyError);
        return bcrypt.compare(pass, found.hashpass);
    }).then((result) => {
        req.session.user = found;
        res.redirect('/');
    })
        .catch((e) => {
            res.render('login', {fail: e});
        });
}
