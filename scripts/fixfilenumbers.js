import MongoStore from 'connect-mongo';
import {MongoClient, ServerApiVersion} from 'mongodb';
import g from '../globals.js';
import path from "path";

if (process.platform == 'linux') {
    g.fileStorageDir = '/var/librarian/files/';
} else {
    g.fileStorageDir = path.join(__dirname, 'public/files/');
}

const mongodb = new MongoClient(g.dburi, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
const clientPromise = mongodb.connect();
