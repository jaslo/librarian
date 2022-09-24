import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import bb from 'express-busboy';
// import busboy from 'connect-busboy';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {MongoClient, ServerApiVersion} from 'mongodb';
import g from './globals.js';

import indexRouter from './routes/index.js';
import usersRouter from './routes/users.js';

import {renderFile as ejsRender} from 'ejs';

var app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
g.publicDir = path.join(__dirname, 'public/');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// app.use(busboy());
bb.extend(app, {
    upload: true,
    allowedPath: /./
});

app.engine('html', ejsRender);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'public'));

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


// mongodb
const mongodb = new MongoClient(g.dburi, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
const clientPromise = mongodb.connect();

app.use(session({
    secret: 'charlie bit me',
    resave: false,
    store: MongoStore.create({clientPromise}),
    saveUninitialized: true,
}))

app.use('/', indexRouter);
app.use('/users', usersRouter);


async function main() {
    // Use connect method to connect to the server
    await clientPromise;
    console.log('Connected successfully to server');
    const db = mongodb.db(g.dbName);
    g.users = db.collection('users');
    g.files = db.collection('files');
    // g.salt = await bcrypt.genSalt(10);
    const hash = await g.hashit(g.defpass);
// upsert to the users collection
    await g.users.findOneAndUpdate(
        {name: g.defname},
        {$set: {
                hashpass: hash,
                verified: true,
                upload: true,
                downloads: []
            }},
        {upsert: true, returnNewDocument: true}
    );
    const uppass = await g.hashit(g.uploadPass);
    await g.users.findOneAndUpdate(
        {name: g.uploaderName},
        {$set: {
                hashpass: uppass,
                verified: true,
                upload: true,
                downloads: []
            }},
        {upsert: true, returnNewDocument: true}
    );

    return 'done.';
}

main().then(() => {
        app.listen(3000, () => {
            console.log("http server up on port 3000");
        })
});

// export default app;

