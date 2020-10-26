const wa = require('@open-wa/wa-automate');
const csvtojson = require("csvtojson/v2");
const fsRenameSync = require('fs').renameSync;

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

const startWA = async (client, contacts) => {
  const synced = await client.syncContacts()
  const own = await client.getMe()
  console.log(own.status, own.pushname)
  console.log('==SYNCED CONTACT==', synced)
  console.log('==START SEND CHAT==');
  try {
    for (let index = 0; index < contacts.length; index++) {
      const contact = contacts[index];
      await client.sendFile(
        `${contact.Phone}@c.us`, //chatId
        `${contact.file}`, // filePath
        `${contact.Phone}.${contact.Name}.pdf`, //filename
        `Paylip Kamu ${contact.Name}` //caption
      );
      console.log('==SUCCESS SEND FILE==');
    }
  } catch (error) {
    console.log('SEND ERR!!: Cause', error);
    client.kill();
  }

  console.log('==END SEND CHAT==');
  client.kill()
}


Boot()