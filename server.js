require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const app = express();

// CORS – allow Netlify and local development
const allowedOrigins = [
    'https://smarttop.netlify.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 5000;

// CheapDataHub config
const CHEAPDATAHUB_API_KEY = process.env.CHEAPDATAHUB_API_KEY;
const CHEAPDATAHUB_BASE_URL = 'https://www.cheapdatahub.ng/api/v1/resellers';

// ID mappings for airtime (provider_id)
const providerIdMap = { mtn: 1, glo: 2, airtel: 3, '9mobile': 4 };

// Electricity disco IDs (example)
const discoIdMap = {
    'ikeja-electric': 1, 'eko-electric': 2, 'abuja-electric': 3
};

// Cable provider IDs & plan IDs (example)
const cableProviderIdMap = { dstv: 1, gotv: 2, startimes: 3 };
const cablePlanIdMap = {
    dstv: { 'basic': 101, 'standard': 102, 'premium': 103 },
    gotv: { 'basic': 201, 'standard': 202, 'premium': 203 },
    startimes: { 'basic': 301, 'standard': 302, 'premium': 303 }
};

// ===================== ADMIN MIDDLEWARE =====================
async function isAdmin(req, res, next) {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data().isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// ===================== SERVICE MANAGEMENT =====================
// Get all active services (public)
app.get('/api/services', async (req, res) => {
    try {
        const snapshot = await db.collection('services').where('isActive', '==', true).get();
        const services = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(services);
    } catch (error) {
        console.error('Error fetching services:', error);
        res.status(500).json({ error: 'Failed to load services' });
    }
});

// Admin: update service price
app.put('/api/admin/services/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { price } = req.body;
    if (!price) return res.status(400).json({ error: 'Price required' });
    await db.collection('services').doc(id).update({ price });
    res.json({ success: true });
});

// Admin: add new service (manual)
app.post('/api/admin/services', isAdmin, async (req, res) => {
    const serviceData = req.body;
    const id = `${serviceData.type}_${serviceData.network || serviceData.provider}_${serviceData.size || ''}_${serviceData.duration || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
    serviceData.createdAt = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('services').doc(id).set(serviceData);
    res.json({ success: true, id });
});

// ===================== PURCHASE FUNCTIONS =====================

// Airtime
app.post('/api/airtime', async (req, res) => {
    const { phone, network, amount, userId } = req.body;
    if (!phone || !network || !amount || !userId) return res.status(400).json({ error: 'Missing fields' });
    const provider_id = providerIdMap[network.toLowerCase()];
    if (!provider_id) return res.status(400).json({ error: 'Invalid network' });

    try {
        const response = await axios.post(`${CHEAPDATAHUB_BASE_URL}/airtime/purchase/`, {
            provider_id,
            phone_number: phone,
            amount: Number(amount)
        }, {
            headers: { 'Authorization': `Bearer ${CHEAPDATAHUB_API_KEY}`, 'Content-Type': 'application/json' }
        });

        if (response.data.status === "true") {
            const userRef = db.collection('users').doc(userId);
            await userRef.update({ balance: admin.firestore.FieldValue.increment(-parseFloat(amount)) });
            await userRef.collection('transactions').add({
                type: 'Airtime',
                details: `${network} - ${phone}`,
                amount: parseFloat(amount),
                status: 'success',
                date: admin.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('orders').add({
                userId,
                type: 'Airtime',
                details: { network, phone, amount: parseFloat(amount) },
                status: 'success',
                date: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        res.json(response.data);
    } catch (error) {
        console.error('Airtime error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Airtime purchase failed' });
    }
});

// Data Purchase (uses bundle_id from service)
app.post('/api/data', async (req, res) => {
    const { phone, network, bundle_id, amount, userId } = req.body;
    if (!phone || !bundle_id || !userId) return res.status(400).json({ error: 'Missing fields' });

    try {
        const response = await axios.post(`${CHEAPDATAHUB_BASE_URL}/data/purchase/`, {
            bundle_id: bundle_id,
            phone_number: phone
        }, {
            headers: { 'Authorization': `Bearer ${CHEAPDATAHUB_API_KEY}`, 'Content-Type': 'application/json' }
        });

        if (response.data.status === "true") {
            const userRef = db.collection('users').doc(userId);
            await userRef.update({ balance: admin.firestore.FieldValue.increment(-parseFloat(amount)) });
            await userRef.collection('transactions').add({
                type: 'Data',
                details: `${network} - Bundle ID: ${bundle_id}`,
                amount: parseFloat(amount),
                status: 'success',
                date: admin.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('orders').add({
                userId,
                type: 'Data',
                details: { network, bundle_id, phone, amount: parseFloat(amount) },
                status: 'success',
                date: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        res.json(response.data);
    } catch (error) {
        console.error('Data error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Data purchase failed' });
    }
});

// Electricity
app.post('/api/electricity', async (req, res) => {
    const { provider, meterNumber, amount, userId } = req.body;
    if (!provider || !meterNumber || !amount || !userId) return res.status(400).json({ error: 'Missing fields' });
    const disco_id = discoIdMap[provider.toLowerCase()];
    if (!disco_id) return res.status(400).json({ error: 'Invalid provider' });

    try {
        const response = await axios.post(`${CHEAPDATAHUB_BASE_URL}/electricity/purchase/`, {
            disco_id,
            meter_number: meterNumber,
            amount: Number(amount),
            phone_number: ''
        }, {
            headers: { 'Authorization': `Bearer ${CHEAPDATAHUB_API_KEY}`, 'Content-Type': 'application/json' }
        });

        if (response.data.status === "true") {
            const userRef = db.collection('users').doc(userId);
            await userRef.update({ balance: admin.firestore.FieldValue.increment(-parseFloat(amount)) });
            await userRef.collection('transactions').add({
                type: 'Electricity',
                details: `${provider} - ${meterNumber}`,
                amount: parseFloat(amount),
                status: 'success',
                date: admin.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('orders').add({
                userId,
                type: 'Electricity',
                details: { provider, meterNumber, amount: parseFloat(amount) },
                status: 'success',
                date: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        res.json(response.data);
    } catch (error) {
        console.error('Electricity error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Electricity payment failed' });
    }
});

// Cable TV
app.post('/api/cabletv', async (req, res) => {
    const { provider, smartCard, plan, userId, amount } = req.body;
    if (!provider || !smartCard || !plan || !userId) return res.status(400).json({ error: 'Missing fields' });
    const cable_id = cableProviderIdMap[provider.toLowerCase()];
    if (!cable_id) return res.status(400).json({ error: 'Invalid provider' });
    const plan_id = cablePlanIdMap[provider.toLowerCase()]?.[plan];
    if (!plan_id) return res.status(400).json({ error: 'Invalid plan' });

    try {
        const response = await axios.post(`${CHEAPDATAHUB_BASE_URL}/cable/purchase/`, {
            cable_id,
            smart_card_number: smartCard,
            plan_id
        }, {
            headers: { 'Authorization': `Bearer ${CHEAPDATAHUB_API_KEY}`, 'Content-Type': 'application/json' }
        });

        if (response.data.status === "true") {
            const userRef = db.collection('users').doc(userId);
            await userRef.update({ balance: admin.firestore.FieldValue.increment(-parseFloat(amount)) });
            await userRef.collection('transactions').add({
                type: 'Cable TV',
                details: `${provider} - ${smartCard}`,
                amount: parseFloat(amount),
                status: 'success',
                date: admin.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('orders').add({
                userId,
                type: 'Cable TV',
                details: { provider, smartCard, plan, amount: parseFloat(amount) },
                status: 'success',
                date: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        res.json(response.data);
    } catch (error) {
        console.error('Cable TV error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Cable TV subscription failed' });
    }
});

// ===================== PAYSTACK VERIFICATION =====================
app.post('/api/verify-payment', async (req, res) => {
    const { reference, userId, amount } = req.body;
    if (!reference || !userId || !amount) return res.status(400).json({ success: false, error: 'Missing fields' });

    try {
        const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
        });

        if (response.data.status && response.data.data.status === 'success') {
            const userRef = db.collection('users').doc(userId);
            await db.runTransaction(async (transaction) => {
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) throw new Error('User not found');
                const currentBalance = userDoc.data().balance || 0;
                transaction.update(userRef, { balance: currentBalance + parseFloat(amount) });
            });
            await userRef.collection('transactions').add({
                type: 'Wallet Funding',
                amount: parseFloat(amount),
                reference,
                status: 'success',
                date: admin.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('orders').add({
                userId,
                type: 'Deposit',
                details: { amount: parseFloat(amount), reference },
                status: 'success',
                date: admin.firestore.FieldValue.serverTimestamp()
            });
            res.json({ success: true });
        } else {
            res.status(400).json({ success: false, error: 'Payment not successful' });
        }
    } catch (error) {
        console.error('Verification error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===================== ADMIN ENDPOINTS =====================
app.get('/api/admin/users', isAdmin, async (req, res) => {
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(users);
});

app.get('/api/admin/orders', isAdmin, async (req, res) => {
    const snapshot = await db.collection('orders').orderBy('date', 'desc').limit(100).get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(orders);
});

app.get('/api/admin/deposits', isAdmin, async (req, res) => {
    const snapshot = await db.collectionGroup('transactions').where('type', '==', 'Wallet Funding').orderBy('date', 'desc').limit(100).get();
    const deposits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), userId: doc.ref.parent.parent.id }));
    res.json(deposits);
});

// ===================== START SERVER =====================
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));