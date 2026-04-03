// import-data.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Path to your service account key
const dataPlans = require('./data_plans.json'); // Path to your data plans JSON

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function importDataPlans() {
  console.log('Starting data import...');
  const batch = db.batch();
  let count = 0;

  for (const plan of dataPlans) {
    // Generate a unique ID for each service
    const docId = `${plan.type}_${plan.network}_${plan.size}_${plan.duration}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const docRef = db.collection('services').doc(docId);
    
    // Prepare the data object for Firestore
    const serviceData = {
      ...plan,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      type: 'data', // Explicitly set type to 'data'
    };
    
    batch.set(docRef, serviceData);
    count++;
    
    // Firestore batches can only have 500 operations
    if (count % 500 === 0) {
      await batch.commit();
      console.log(`Committed batch of ${count} plans.`);
      // Create a new batch for remaining operations
    }
  }
  
  // Commit the final batch
  if (count % 500 !== 0) {
    await batch.commit();
  }
  console.log(`Successfully imported ${count} data plans.`);
}

importDataPlans().catch(console.error);