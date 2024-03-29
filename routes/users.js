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

function passwordEmail(req, idstr) {

    return `Hello,<br/>
      Someone using this email has just requested a password change for "librarian". 
      <br/>
      If this was your intention, please use 
      <a href="${req.headers.origin}/changepass/${idstr}">this link</a> 
      within 15 minutes to change your password.<br/>
      Otherwise, ignore this message!
    `;
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

export async function setNewPassword(req,res) {
    const id = req.body.id;
    const user = await g.users.findOne({_id: new ObjectId(id)});
    if (user.hashpass != req.body.validate) {
        res.render('newpassword',{fail: 'invalid password change', id: req.params.id, validate: user.hashpass });
    }
    const hash = await bcrypt.hash(req.body.pass, 10);
    let userRecord = await g.users.findOneAndUpdate(
        {_id: new ObjectId(id)},
        {$set: {hashpass: hash, verified: true}},
        {upsert: true, returnDocument: "after"}
    );
    res.redirect('/')
}

export async function newPassPage(req,res) {
    const id = req.params.id;
    const user = await g.users.findOne({_id: new ObjectId(id)});

    res.render('newpassword',{id: req.params.id, validate: user.hashpass });
}

export async function changePassRequest(req,res) { // send change password email
    let username = req.body.username;
    const user = await g.users.findOne({name: username});
    if (user) {
        const sendmail = {
            from: 'librarian@vtable.com',
            to: user.name,
            subject: 'Password change request',
            html: passwordEmail(req, user._id.toString())
        };
        g.transporter.sendMail(sendmail);
    }
    res.render('login', {fail: "If that email is registered, an email has been sent to change the password"});

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
