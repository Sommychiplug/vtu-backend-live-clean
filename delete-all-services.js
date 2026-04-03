// delete-all-services.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function deleteAllServices() {
  console.log('Deleting all documents from services collection...');
  const servicesSnapshot = await db.collection('services').get();
  const batch = db.batch();
  let count = 0;
  
  servicesSnapshot.forEach(doc => {
    batch.delete(doc.ref);
    count++;
  });
  
  await batch.commit();
  console.log(`Deleted ${count} documents from services collection.`);
}

deleteAllServices().catch(console.error);