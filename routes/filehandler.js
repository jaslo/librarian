import g from "../globals.js";
import {ObjectID as ObjectId} from "mongodb";
import fs from "fs";

export function downloadFile(req, res, next) {
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
                filenumber: parseInt(req.body.filenumber),
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
                    filenumber: parseInt(filenumber),
                    docname: docname,
                    downloads: []
                }
            },
            {upsert: true, returnNewDocument: true}
        );
    }
}

export async function uploadFiles(req, res) {
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
            filenumber: parseInt(filenumber),
            docname: docname
        };
    }
    let updated = 0;
    if (req.files.formFiles) {
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
