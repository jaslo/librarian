import g from "../globals.js";
import {ObjectId} from "mongodb";
import fs from "fs";


export function toggleFile(req, res, next) {
    const id = req.params.id; // file id

    g.files.find({_id: new ObjectId(id)}, {
        projection: {_id: 0, idstr: {$toString:"$_id"}, name: 1, filenumber: 1, docname: 1, downloads: {$elemMatch: { $eq: req.session.user._id}}},
        sort: {filenumber: 1, docname: 1}
    }).toArray().then(async (finds) => {
        if (finds[0].downloads) { // was downloaded, setting to not downloaded
            await resetDownloaded(req, id);
        } else {
            await setDownloaded(req, id);
        }
        res.status(200).end();
    });
}

export function NewFileAdd(docname, filename, filenumber) {
    g.newFiles.push({docname, filename, filenumber});
    return g.files.findOneAndUpdate(
        {docname: docname, filenumber: filenumber},
        {
            $set: {
                name: filename,
                filenumber: filenumber,
                docname: docname,
                urlpath: filename,
                downloads: []
            }
        },
        {upsert: true, returnNewDocument: true}
    );
}


async function resetDownloaded(req, fileid) {
   await g.files.findOneAndUpdate({_id: new ObjectId(fileid)},
        {$pull: {downloads: {$eq: req.session.user._id}}});
   await g.users.findOneAndUpdate(
        {_id: new ObjectId(req.session.user._id)},
        {$pull: {downloads: fileid}});
}

async function setDownloaded(req, fileid) {
    let fdoc0;
    fdoc0 = await g.files.findOneAndUpdate({_id: new ObjectId(fileid)},
        {$addToSet: {downloads: req.session.user._id}},
        {returnDocument: "before"});
    if (fdoc0.value) {
        await g.users.findOneAndUpdate(
            {_id: new ObjectId(req.session.user._id)},
            {$addToSet: {downloads: fileid}},
            {returnDocument: "before"});
        return fdoc0;
    }
    return null;
}

export async function editDelete(req, res, next = console.error) {
    const id = req.params.id;
    await g.files.findOneAndDelete({_id: new ObjectId(fileid)});
}

export async function editSave(req, res, next = console.error) {
    const id = req.params.id;
    var newname = req.body.filename;
    var newnum = req.body.filenumber;

    await g.files.findOneAndUpdate({
        filter: {_id: new ObjectId(fileid)},
        update: {
            $set: {
                name: newname,
                filenumber: parseInt(newnum),
                docname: newname
            }
        }
    });

}


export async function downloadFile(req, res, next = console.error) {
    try {
        const id = req.params.id;
        console.log("downloadfile " + id);
        let fdoc0 = await setDownloaded(req, id);
        console.log("downloadfile " + fdoc0.value.name);
        // res.sendFile(fdoc0.value.urlpath, (err) => {
        if (fdoc0) {
            res.download(g.fileStorageDir + fdoc0.value.urlpath, fdoc0.value.name, {
                maxAge: 0,
                lastModified: 0
            }, (err) => {
                if (!err) {
                    res.status(200).end();
                } else {
                    res.status(404).send("Error: The file is not on the server");
                }
            });
        } else {
            res.status(404).send("Error: File ID not found");
        }
    } catch (error) {
        console.log("downloadfile catch: " + error);
    }
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

                await NewFileAdd(fmeta.docname, ff.filename, fmeta.filenumber);
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
