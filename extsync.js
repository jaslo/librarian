import g from "./globals.js";
import * as fs from 'node:fs';

import qs from 'qs';
import axios from 'axios';
import { finished } from 'node:stream';
import { promisify } from 'node:util';
const finishedAsync = promisify(finished);
//nodimport url from 'node:url';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import _ from 'lodash';

import cheerio from 'cheerio';

const jar = new CookieJar();
const client = wrapper(axios.create({jar}));

export async function syncToExternal() {

    const allfiles = await g.files.find({}, {
        projection: {_id: 0, idstr: {$toString:"$_id"}, name: 1, filenumber: 1, docname: 1},
        sort: {filenumber: 1, docname: 1}
    }).toArray();

    const localFiles = _.reduce(allfiles, (acc, item) => {
        acc[item.docname] = {
            filenumber: item.filenumber,
            name: item.name
        };
        return acc;
    },{})

    console.log("here");

    // login to wordpress download part:
    const dlpart = await client.post("https://www.topshelfbigband.com/wp-login.php",
        qs.stringify({
            log: g.TopShelfLogin,
            pwd: g.TopShelfPassword}), {
            headers: 'application/x-www-form-urlencoded'
        });
    let cookies = await dlpart.config.jar.getCookies("https://www.topshelfbigband.com/wp-content/uploads/_mediavault/2019/05/In-the-Mood-Miller.pdf");
    let cookiecoll = cookies.map((item) => {
        return item.key + "=" + decodeURIComponent(item.value);
    });
    const dlcookies = cookiecoll.join(';');

    /*
    let testdata;
    try {
        testdata = await client.get('https://www.topshelfbigband.com/wp-content/uploads/_mediavault/2019/06/Sweet-Georgia-Brown.zip', {
            withCredentials: true,
            headers: {
                "Cookie": dlcookies
            },
            responseType: 'stream'
        })
    }
    catch (e) {
        console.log(e);
    }
*/

    // wordpress_test_cookie=WP Cookie check;
    // wordpress_logged_in_8cd1b65017824000ff32d97f5b1eef31=band-member|
    //  1674172548|
    //  46BeaSz6SN6Vb1aAd0EnGQ8fCxIwqnTRPZidLTJ814K|
    //  cfe3576190cc4d9fb239441ac45e8d3a5be65c2ef0b1f805e1a1ca17ea359d56;
    // wp-settings-2=unfold=1&
    // mfold=o;
    // wp-settings-time-2=1673999749;
    // icwp-wpsf-notbot=1674004601zccd9ee5ba7408ced851324c64090d9b8d38d3a90;
    // wp-postpass_8cd1b65017824000ff32d97f5b1eef31=$P$BZSbZdr..nbGHo1aPFvJfR2na/5O/7/;
    // shield-notbot-nonce=1414aaa91c

    // actual
    // shield-notbot-nonce=9f0e589783;
    // wordpress_test_cookie=WP Cookie check;
    // wordpress_logged_in_8cd1b65017824000ff32d97f5b1eef31=band-member|
    //  1674177739|y0EchsOsjCkik6ridahd6FaNgM2KOOEbWQLmUwzkJik|195d5c3f9f3709cd8baae349b3967a3ef7fa9c9e110959b37b8c52d020d1618d;wp-settings-2=unfold=1&mfold=o;wp-settings-time-2=1674004939



//    const start = await client.get("https://topshelfbigband.com/for-band-members/library/");
//    if (start.data.indexOf("This content is password protected") > -1) {
//        console.log("failed to get");
//    }
    const data = await client.post("https://topshelfbigband.com/wp-login.php?action=postpass",
        qs.stringify({'post_password': g.TOpShelfPassword}), {
        headers: 'application/x-www-form-urlencoded'
    });
    console.log(data.config.jar.toJSON());
    cookies = await data.config.jar.getCookies("https://topshelfbigband.com/for-band-members/library/");
    cookiecoll = cookies.map((item) => {
        return item.key + "=" + item.value;
    });
    const cookieacc = cookiecoll.join(';');
    const page = await client.get("https://topshelfbigband.com/for-band-members/library/",{
        withCredentials: true,
        headers: {
            "Cookie": cookieacc
        }
    });
    if (page.data.indexOf("This content is password protected") > -1) {
        console.log("failed to get");
        console.log(page.config.jar.toJSON());
        return;
    }
    console.log('success!!!!');

    const $ = cheerio.load(page.data);
    const listtop = $(".entry-the-content ul");
    const items = $(listtop).find("li");

    const remoteFiles = _.reduce(items, (acc, item) => {
        let num = null;
        let name = null;
        let link = null;
        let namenum = '';
        const processChild = (child) => {
            console.log(child.type);
            if (child.type == "text") {
                namenum += child.data;
            } else if (child.type == "tag" && child.name == "a") {
                link = child.attribs['href'];
            } else {
                // panic!
                console.log("WHAT!!!");
            }
            if (child.children) {
                child.children.forEach((child) => processChild(child));
            }
        };

        item.childNodes.forEach((child) => processChild(child));

        let n = namenum.indexOf(' ');
        num = namenum.substr(0, n);
        name = namenum.substr(n + 1);
        let fnum = parseInt(num.trim());
        if (isNaN(fnum)) fnum = num.trim();
        acc[name.trim()] = {
            filenumber: fnum,
            name: link
        };
        return acc;
    }, {});

    // for each item in remoteFiles
    // see if it's in the mongodb files map (localFiles)
    // if not, fetch the file and save it and add the record to the database

    for (const k of _.keys(remoteFiles)) {
        if (!localFiles[k]) {
            // fetch file remoteFiles.name, split out url path from file
            let remurl = remoteFiles[k].name;
            if (remurl) {
                let slash = remurl.lastIndexOf('/');
                let quest = remurl.indexOf('?', slash);
                if (quest < 0) quest = remurl.length;
                let filename = remurl.substr(slash + 1, quest - slash);

                let newpath = g.fileStorageDir + filename;
                const writer = fs.createWriteStream(newpath);
                let urlstream;
                try {
                    urlstream = await client.get(remurl, {
                        withCredentials: true,
                        headers: {
                            "Cookie": dlcookies
                        },
                        responseType: 'stream'
                    });
                    urlstream.data.pipe(writer);
                    writer.on('error', err => {
                        writer.close();
                        console.log('write file error: ' + err);
                    });
                    await finishedAsync(writer);
                } catch (e) {
                    console.log(e);
                }
                /*
                await g.files.findOneAndUpdate(
                    {docname: k},
                    {
                        $set: {
                            filenumber: remoteFiles[k].filenumber,
                            docname: k,
                            name: filename,
                            urlpath: filename,
                            downloads: []
                        }
                    },
                    {upsert: true, returnNewDocument: true}
                );
                 */
            } else { // no remote url, just an entry
                await g.files.findOneAndUpdate(
                    {docname: k},
                    {
                        $set: {
                            filenumber: remoteFiles[k].filenumber,
                            docname: k,
                            downloads: []
                        }
                    },
                    {upsert: true, returnNewDocument: true}
                );
            }
        }
    }

    console.log('here');

}