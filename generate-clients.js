const fs = require('fs');
const path = require('path');
const { faker } = require('@faker-js/faker');

const targetGB = 4;
const maxBytes = targetGB * 1024 * 1024 * 1024;

const now = new Date();
const MM = String(now.getMonth() + 1).padStart(2, '0');
const YY = String(now.getFullYear()).slice(-2);

let lineCount = 0;
let accumulatedSize = 0;
let currentId = 3099;

const tempFile = path.join('./', 'CLIENTS_TMP.dat');
const stream = fs.createWriteStream(tempFile, { flags: 'w' });

console.log(`Generating file of ~${targetGB} GB...`);

function generateLine(id) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet.email({ firstName, lastName }).toLowerCase();
    const age = faker.number.int({ min: 1, max: 120 });
    return `${id}|${firstName}|${lastName}|${email}|${age}\n`;
}

function finalize() {
    const finalName = `CLIENTS_IN_${MM}${YY}_MERGED_PROD_${lineCount}.dat`;
    fs.renameSync(tempFile, path.join('./', finalName));
    console.log(`✅ File generated: ${finalName}`);
    console.log(`📦 Final size: ${(accumulatedSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);
    console.log(`📄 Total lines: ${lineCount}`);
}

async function generate() {
    while (accumulatedSize < maxBytes) {
        const id = String(currentId).padStart(6, '0');
        const line = generateLine(id);

        stream.write(line);
        accumulatedSize += Buffer.byteLength(line, 'utf8');
        lineCount++;
        currentId++;

        if (lineCount % 1000 === 0) {
            await new Promise(resolve => setImmediate(resolve));
            if (global.gc) global.gc();
        }
    }

    stream.end(finalize);
}

generate();
