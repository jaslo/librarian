# librarian
a browser based file library system for tracking downloads on a per user basis
also allows for "library" entries with no file associate, just document name (and optional number)



configure in "globals.js" like this

import bcrypt from "bcrypt";

const g = {

    dbName: 'topshelf',
    dburi: "mongodb+srv://xxxxx@yyyy,
    // for admin user
    defname: 'admin',
    defpass: 'xxxx',
    salt: '$2b$10$QJ4S.Lck.xxxxxxxxxxxx', // must use a constant for mongodb find
    // for uploader user
    uploaderName: 'uploader',
    uploadPass: 'xxxxx',
    // for new signups
    secretCode: 'xxxxx',
    // for SES email loop
    awsaccess: "xxxx",
    awssecret: "xxxxx",
    async hashit(pass) {
        const hash = await bcrypt.hash(pass, g.salt);
        return hash;
    }
};

export default g;
