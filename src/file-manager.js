const fs = require('fs'); // for openSync

function overWriteFile(fileName, bin) {
    const data = Buffer.from(bin);

    fs.writeFile(fileName, data, (err) => {
      if (err) console.log(err);
    });
}

function writeTextFile(fileName, txt) {
    try {
      fs.writeFileSync(fileName, txt, 'utf8');
      console.log('File written successfully');
    } catch (err) {
      console.error('Error writing file:', err);
    }
}

function readFile(fileName, cb) {
    try {
        const data = fs.readFileSync(fileName);
        cb(data);
    } catch(e) {
        console.log(`Error opening file ${fileName}`);
        cb(null);
        return null;
    }
}

globalThis.writeTextFile = writeTextFile;
globalThis.overWriteFile = overWriteFile;
globalThis.readFile=readFile;