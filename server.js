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

// CORS – allow multiple origins
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

// ID mappings (adjust to CheapDataHub actual IDs)
const providerIdMap = { mtn: 1, glo: 2, airtel: 3, '9mobile': 4 };
const bundleIdMap = {
    mtn: { '500': 101, '1000': 102, '2000': 103 },
    glo: { '500': 201, '1000': 202, '2000': 203 },
    airtel: { '500': 301, '1000': 302, '2000': 303 },
    '9mobile': { '500': 401, '1000': 402, '2000': 403 }
};
const discoIdMap = {
    'ikeja-electric': 1, 'eko-electric': 2, 'abuja-electric': 3
};
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
// Seed default services if none exist
async function seedServices() {
    try {
        const servicesSnapshot = await db.collection('services').limit(1).get();
        if (!servicesSnapshot.empty) {
            console.log('Services already exist, skipping seed.');
            return;
        }

        const defaultServices = [
            { id: 'airtime_mtn', name: 'MTN Airtime', type: 'airtime', network: 'mtn', basePrice: 100, price: 100, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'airtime_glo', name: 'Glo Airtime', type: 'airtime', network: 'glo', basePrice: 100, price: 100, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'airtime_airtel', name: 'Airtel Airtime', type: 'airtime', network: 'airtel', basePrice: 100, price: 100, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'airtime_9mobile', name: '9mobile Airtime', type: 'airtime', network: '9mobile', basePrice: 100, price: 100, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'data_mtn_500', name: 'MTN 500MB', type: 'data', network: 'mtn', plan: '500', basePrice: 100, price: 100, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'data_mtn_1000', name: 'MTN 1GB', type: 'data', network: 'mtn', plan: '1000', basePrice: 200, price: 200, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'data_mtn_2000', name: 'MTN 2GB', type: 'data', network: 'mtn', plan: '2000', basePrice: 400, price: 400, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'data_glo_500', name: 'Glo 500MB', type: 'data', network: 'glo', plan: '500', basePrice: 100, price: 100, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'data_glo_1000', name: 'Glo 1GB', type: 'data', network: 'glo', plan: '1000', basePrice: 200, price: 200, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'data_glo_2000', name: 'Glo 2GB', type: 'data', network: 'glo', plan: '2000', basePrice: 400, price: 400, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'data_airtel_500', name: 'Airtel 500MB', type: 'data', network: 'airtel', plan: '500', basePrice: 100, price: 100, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'data_airtel_1000', name: 'Airtel 1GB', type: 'data', network: 'airtel', plan: '1000', basePrice: 200, price: 200, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'data_airtel_2000', name: 'Airtel 2GB', type: 'data', network: 'airtel', plan: '2000', basePrice: 400, price: 400, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'data_9mobile_500', name: '9mobile 500MB', type: 'data', network: '9mobile', plan: '500', basePrice: 100, price: 100, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'data_9mobile_1000', name: '9mobile 1GB', type: 'data', network: '9mobile', plan: '1000', basePrice: 200, price: 200, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'data_9mobile_2000', name: '9mobile 2GB', type: 'data', network: '9mobile', plan: '2000', basePrice: 400, price: 400, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'electricity_ikeja', name: 'Ikeja Electric', type: 'electricity', provider: 'ikeja-electric', basePrice: 0, price: 0, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'electricity_eko', name: 'Eko Electric', type: 'electricity', provider: 'eko-electric', basePrice: 0, price: 0, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'electricity_abuja', name: 'Abuja Electric', type: 'electricity', provider: 'abuja-electric', basePrice: 0, price: 0, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'cable_dstv_basic', name: 'DSTV Basic', type: 'cable', provider: 'dstv', plan: 'basic', basePrice: 2500, price: 2500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'cable_dstv_standard', name: 'DSTV Standard', type: 'cable', provider: 'dstv', plan: 'standard', basePrice: 4500, price: 4500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'cable_dstv_premium', name: 'DSTV Premium', type: 'cable', provider: 'dstv', plan: 'premium', basePrice: 9500, price: 9500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'cable_gotv_basic', name: 'GOTV Basic', type: 'cable', provider: 'gotv', plan: 'basic', basePrice: 2500, price: 2500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'cable_gotv_standard', name: 'GOTV Standard', type: 'cable', provider: 'gotv', plan: 'standard', basePrice: 4500, price: 4500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'cable_gotv_premium', name: 'GOTV Premium', type: 'cable', provider: 'gotv', plan: 'premium', basePrice: 9500, price: 9500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'cable_startimes_basic', name: 'Startimes Basic', type: 'cable', provider: 'startimes', plan: 'basic', basePrice: 2500, price: 2500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'cable_startimes_standard', name: 'Startimes Standard', type: 'cable', provider: 'startimes', plan: 'standard', basePrice: 4500, price: 4500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
            { id: 'cable_startimes_premium', name: 'Startimes Premium', type: 'cable', provider: 'startimes', plan: 'premium', basePrice: 9500, price: 9500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() }
        ];

        const batch = db.batch();
        for (const service of defaultServices) {
            const docRef = db.collection('services').doc(service.id);
            batch.set(docRef, service);
        }
        await batch.commit();
        console.log('✅ Default services seeded successfully!');
    } catch (error) {
        console.error('❌ Error seeding services:', error);
    }
}
seedServices();

// Get all services (public)
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

// Admin: create a new service
app.post('/api/admin/services', isAdmin, async (req, res) => {
    try {
        const serviceData = req.body;
        let id = `${serviceData.type}`;
        if (serviceData.network) id += `_${serviceData.network}`;
        if (serviceData.plan) id += `_${serviceData.plan}`;
        if (serviceData.provider) id += `_${serviceData.provider}`;
        id = id.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        
        const docRef = db.collection('services').doc(id);
        await docRef.set({
            ...serviceData,
            id,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json({ success: true, id });
    } catch (error) {
        console.error('Error creating service:', error);
        res.status(500).json({ error: error.message });
    }
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

// Data
app.post('/api/data', async (req, res) => {
    const { phone, network, plan, userId, amount } = req.body;
    if (!phone || !network || !plan || !userId) return res.status(400).json({ error: 'Missing fields' });
    const networkKey = network.toLowerCase();
    const bundle_id = bundleIdMap[networkKey]?.[plan];
    if (!bundle_id) return res.status(400).json({ error: 'Invalid network or plan' });

    try {
        const response = await axios.post(`${CHEAPDATAHUB_BASE_URL}/data/purchase/`, {
            bundle_id,
            phone_number: phone
        }, {
            headers: { 'Authorization': `Bearer ${CHEAPDATAHUB_API_KEY}`, 'Content-Type': 'application/json' }
        });

        if (response.data.status === "true") {
            const userRef = db.collection('users').doc(userId);
            await userRef.update({ balance: admin.firestore.FieldValue.increment(-parseFloat(amount)) });
            await userRef.collection('transactions').add({
                type: 'Data',
                details: `${network} - ${plan}`,
                amount: parseFloat(amount),
                status: 'success',
                date: admin.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('orders').add({
                userId,
                type: 'Data',
                details: { network, plan, phone, amount: parseFloat(amount) },
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
// Get all users
app.get('/api/admin/users', isAdmin, async (req, res) => {
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(users);
});

// Get all orders
app.get('/api/admin/orders', isAdmin, async (req, res) => {
    const snapshot = await db.collection('orders').orderBy('date', 'desc').limit(100).get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(orders);
});

// Get all deposits (transactions of type 'Wallet Funding')
app.get('/api/admin/deposits', isAdmin, async (req, res) => {
    const snapshot = await db.collectionGroup('transactions').where('type', '==', 'Wallet Funding').orderBy('date', 'desc').limit(100).get();
    const deposits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), userId: doc.ref.parent.parent.id }));
    res.json(deposits);
});

// ===================== START SERVER =====================
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));