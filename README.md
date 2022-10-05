# librarian
a browser based file library system for tracking downloads on a per user basis
also allows for "library" entries with no file associate, just document name (and optional number)



configure in "globals.js" like this

const g = {

    dbName: 'topshelf',
    dburi: "mongodb+srv://xxxxx@yyyy,
    // for admin user
    defname: 'admin',
    defpass: 'xxxx',
    // for uploader user
    uploaderName: 'uploader',
    uploadPass: 'xxxxx',
    // for new signups
    secretCode: 'xxxxx',
    // for SES email loop
    awsaccess: "xxxx",
    awssecret: "xxxxx",
};

export default g;
