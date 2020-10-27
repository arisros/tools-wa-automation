const wa = require('@open-wa/wa-automate');
const csvtojson = require("csvtojson/v2");
const fsRenameSync = require('fs').renameSync;
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const prefixOldFiles = 'PaySlip_September_-';
const sessionId = 'newSessionId'
const csvFilePath = './contacts/all.csv';
const config = {
  sessionId: sessionId, 
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
};

const getAllContacts = async () => {
  const csvArray = await csvtojson().fromFile(csvFilePath);
  const contacts = csvArray.map(e => {
    if (!/^0/.test(e.Phone)) {
      throw new Error(`Ada kontak yang belum sesuai (awali dengan angka 0 saja :) ), ${e.Phone} - ${e.Name}`)
    }
    return {
      ...e,
      Phone: e.Phone.replace(/^0/, '62')
    }
  })
  return contacts
}

const Boot = async () => {
  const client = await wa.create(config)
  try {
    const contacts = await getAllContacts();
    await contactValidation(client, contacts);
    const contactWithFiles = await renameFilesFromContacts(contacts);
    startWA(client, contactWithFiles);
  } catch (error) {
    console.log(error);
    client.kill();
  }
}



const renameFilesFromContacts = async (contacts) => {
  const contactWithFiles = contacts.map(async (c, i) => {
    const oldFilePath = `./files/${prefixOldFiles}${i+1}.pdf`;
    const newFilePath = `./filesToSend/${c.Phone}.${c.Name}.pdf`;
    await fsRenameSync(oldFilePath, newFilePath);
    return {
      ...c,
      file: newFilePath
    }
  })
  return Promise.all(contactWithFiles)
}

const contactValidation = async (client, contacts) => {
  let contactInvalid = [];
  try {
    for (let index = 0; index < contacts.length; index++) {
      const contact = contacts[index];
      const details = await client.getContact(`${contact.Phone}@c.us`) || {}
      const detailName = details.name || null
      if (detailName !== contact.Name) {
        contactInvalid.push({
          name: contact.Name,
          phone: contact.Phone,
          fromDetailContact: details.name ? JSON.stringify(details) : 'Contact Not found'
        })
      }
    }
  } catch (error) {
    console.log(error);
    client.kill()
  }
  if (contactInvalid.length) {
    createLogCSV(contactInvalid, 'invalid-contact')
    throw new Error('Ada kontak yang tidak sama dengan daftar contacts/all.csv');
  }
  console.log('All Contact Are Valid!')
  return true
}

const startWA = async (client, contacts) => {
  const synced = await client.syncContacts()
  const own = await client.getMe()
  console.log(own.status, own.pushname)
  console.log('==Contact Synced==', synced)
  let notSended = []
  try {
    for (let index = 0; index < contacts.length; index++) {
      const contact = contacts[index];
      const send = await client.sendFile(
        `${contact.Phone}@c.us`, //chatId
        `${contact.file}`, // filePath
        `${contact.Phone}.${contact.Name}.pdf`, //filename
        `Paylip Kamu ${contact.Name}` //caption
      );
      if (!send) {
        notSended.push({ contact })
      }
      console.log(`==Success send file to ${contact.Name} - ${contact.Phone}==`);
    }
  } catch (error) {
    if (notSended.length) {
      createLogCSV(notSended, 'failed-send')
    }
    console.log('Send ERR!!: Cause', error);
    client.kill();
  }
  if (notSended.length) {
    createLogCSV(notSended, 'failed-send')
  }
  console.log('==Destroy==');
  client.kill()
}

const generateHeader = rows => {
  if (!rows.length) {
    throw new Error('Tidak ada Data untuk mendapatkan header')
  }
  const header = Object.keys(rows[0]).map(e => ({
    id: e,
    title: e.toUpperCase()
  }))
  return header
}

const createLogCSV = (rows, name) => {
  const now = new Date();
  const dateFormat = `${now.getMonth()}-${now.getDate()}-${now.getFullYear()}:${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`
  const csvWriter = createCsvWriter({
    path: `./errors/${name || 'log'}-${dateFormat}.csv`,
    header: generateHeader(rows)
  });
  
  csvWriter
    .writeRecords(rows)
    .then(()=> console.log(`Log ${name} CSV file was written successfully`));
}


Boot()