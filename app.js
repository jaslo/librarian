import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import session from 'express-session';
import bb from 'express-busboy';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {MongoClient, ServerApiVersion} from 'mongodb';
import bcrypt from 'bcrypt';
import g from './globals.js';

import indexRouter from './routes/index.js';
import usersRouter from './routes/users.js';

var app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'charlie bit me',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: 'auto'
    }
}))

app.use('/', indexRouter);
app.use('/users', usersRouter);

bb.extend(app, {
    upload: true,
    path: '/var/librarian/files',
    allowedPath: /./
});

// mongodb
const mongodb = new MongoClient(g.dburi, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

export let db;
export let users;
export let files;

async function main() {
    // Use connect method to connect to the server
    await mongodb.connect();
    console.log('Connected successfully to server');
    db = mongodb.db(g.dbName);
    users = db.collection('users');
    files = db.collection('files');
    // first time add user 'admin' pass: 'gallifrey'
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(g.defpass, salt);
// upsert to the users collection
    const doc = await users.findOneAndUpdate(
        {name: g.defname},
        {$set: {
                hashpass: hash,
                verified: true,
                upload: true
            }},
        {upsert: true, returnNewDocument: true}
    );

    return 'done.';
}


app.listen(3000, () => {
    main().then(() => {
        console.log("server is up");
    });
});

// export default app;

