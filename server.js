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

// ===================== SEED DEFAULT SERVICES =====================
async function seedServices() {
    const servicesSnapshot = await db.collection('services').limit(1).get();
    if (!servicesSnapshot.empty) return;

    const defaultServices = [
        // Airtime (only one representative)
        { id: 'airtime_mtn', name: 'MTN Airtime', type: 'airtime', network: 'mtn', basePrice: 100, price: 100, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'airtime_glo', name: 'Glo Airtime', type: 'airtime', network: 'glo', basePrice: 100, price: 100, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'airtime_airtel', name: 'Airtel Airtime', type: 'airtime', network: 'airtel', basePrice: 100, price: 100, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'airtime_9mobile', name: '9mobile Airtime', type: 'airtime', network: '9mobile', basePrice: 100, price: 100, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        
        // Data plans (each with a bundleId)
        { id: 'data_mtn_50', name: 'MTN 50MB', type: 'data', network: 'mtn', plan: '50', bundleId: 50, price: 50, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_mtn_100', name: 'MTN 100MB', type: 'data', network: 'mtn', plan: '100', bundleId: 100, price: 90, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_mtn_500', name: 'MTN 500MB', type: 'data', network: 'mtn', plan: '500', bundleId: 500, price: 120, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_mtn_1000', name: 'MTN 1GB', type: 'data', network: 'mtn', plan: '1000', bundleId: 1000, price: 200, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_mtn_2000', name: 'MTN 2GB', type: 'data', network: 'mtn', plan: '2000', bundleId: 2000, price: 350, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_mtn_5000', name: 'MTN 5GB', type: 'data', network: 'mtn', plan: '5000', bundleId: 5000, price: 800, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_glo_50', name: 'Glo 50MB', type: 'data', network: 'glo', plan: '50', bundleId: 50, price: 50, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_glo_100', name: 'Glo 100MB', type: 'data', network: 'glo', plan: '100', bundleId: 100, price: 85, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_glo_500', name: 'Glo 500MB', type: 'data', network: 'glo', plan: '500', bundleId: 500, price: 110, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_glo_1000', name: 'Glo 1GB', type: 'data', network: 'glo', plan: '1000', bundleId: 1000, price: 180, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_glo_2000', name: 'Glo 2GB', type: 'data', network: 'glo', plan: '2000', bundleId: 2000, price: 320, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_glo_5000', name: 'Glo 5GB', type: 'data', network: 'glo', plan: '5000', bundleId: 5000, price: 750, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_airtel_50', name: 'Airtel 50MB', type: 'data', network: 'airtel', plan: '50', bundleId: 50, price: 50, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_airtel_100', name: 'Airtel 100MB', type: 'data', network: 'airtel', plan: '100', bundleId: 100, price: 90, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_airtel_500', name: 'Airtel 500MB', type: 'data', network: 'airtel', plan: '500', bundleId: 500, price: 120, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_airtel_1000', name: 'Airtel 1GB', type: 'data', network: 'airtel', plan: '1000', bundleId: 1000, price: 200, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_airtel_2000', name: 'Airtel 2GB', type: 'data', network: 'airtel', plan: '2000', bundleId: 2000, price: 350, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_airtel_5000', name: 'Airtel 5GB', type: 'data', network: 'airtel', plan: '5000', bundleId: 5000, price: 800, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_9mobile_50', name: '9mobile 50MB', type: 'data', network: '9mobile', plan: '50', bundleId: 50, price: 50, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_9mobile_100', name: '9mobile 100MB', type: 'data', network: '9mobile', plan: '100', bundleId: 100, price: 85, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_9mobile_500', name: '9mobile 500MB', type: 'data', network: '9mobile', plan: '500', bundleId: 500, price: 110, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_9mobile_1000', name: '9mobile 1GB', type: 'data', network: '9mobile', plan: '1000', bundleId: 1000, price: 190, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_9mobile_2000', name: '9mobile 2GB', type: 'data', network: '9mobile', plan: '2000', bundleId: 2000, price: 340, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'data_9mobile_5000', name: '9mobile 5GB', type: 'data', network: '9mobile', plan: '5000', bundleId: 5000, price: 780, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        
        // Electricity (providers)
        { id: 'electricity_ikeja', name: 'Ikeja Electric', type: 'electricity', provider: 'ikeja-electric', isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'electricity_eko', name: 'Eko Electric', type: 'electricity', provider: 'eko-electric', isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'electricity_abuja', name: 'Abuja Electric', type: 'electricity', provider: 'abuja-electric', isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        
        // Cable TV (fixed plans)
        { id: 'cable_dstv_basic', name: 'DSTV Basic', type: 'cable', provider: 'dstv', plan: 'basic', price: 2500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'cable_dstv_standard', name: 'DSTV Standard', type: 'cable', provider: 'dstv', plan: 'standard', price: 4500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'cable_dstv_premium', name: 'DSTV Premium', type: 'cable', provider: 'dstv', plan: 'premium', price: 9500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'cable_gotv_basic', name: 'GOTV Basic', type: 'cable', provider: 'gotv', plan: 'basic', price: 2500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'cable_gotv_standard', name: 'GOTV Standard', type: 'cable', provider: 'gotv', plan: 'standard', price: 4500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'cable_gotv_premium', name: 'GOTV Premium', type: 'cable', provider: 'gotv', plan: 'premium', price: 9500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'cable_startimes_basic', name: 'Startimes Basic', type: 'cable', provider: 'startimes', plan: 'basic', price: 2500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'cable_startimes_standard', name: 'Startimes Standard', type: 'cable', provider: 'startimes', plan: 'standard', price: 4500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { id: 'cable_startimes_premium', name: 'Startimes Premium', type: 'cable', provider: 'startimes', plan: 'premium', price: 9500, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() }
    ];

    const batch = db.batch();
    for (const svc of defaultServices) {
        const docRef = db.collection('services').doc(svc.id);
        batch.set(docRef, svc);
    }
    await batch.commit();
    console.log('✅ Default services seeded.');
}
seedServices();

// ===================== PUBLIC ROUTES =====================
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

// Airtime – any amount
app.post('/api/airtime', async (req, res) => {
    const { phone, network, amount, userId } = req.body;
    if (!phone || !network || !amount || amount < 100 || !userId) {
        return res.status(400).json({ error: 'Invalid fields or amount too low' });
    }
    try {
        // Call CheapDataHub API for airtime
        const response = await axios.post(`${CHEAPDATAHUB_BASE_URL}/airtime/purchase/`, {
            provider_id: { mtn:1, glo:2, airtel:3, '9mobile':4 }[network.toLowerCase()],
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

// Data – uses serviceId to get bundleId
app.post('/api/data', async (req, res) => {
    const { phone, serviceId, userId } = req.body;
    if (!phone || !serviceId || !userId) return res.status(400).json({ error: 'Missing fields' });
    try {
        const serviceDoc = await db.collection('services').doc(serviceId).get();
        if (!serviceDoc.exists) return res.status(404).json({ error: 'Service not found' });
        const service = serviceDoc.data();
        const bundleId = service.bundleId;
        if (!bundleId) return res.status(400).json({ error: 'Invalid data plan' });

        const response = await axios.post(`${CHEAPDATAHUB_BASE_URL}/data/purchase/`, {
            bundle_id: bundleId,
            phone_number: phone
        }, {
            headers: { 'Authorization': `Bearer ${CHEAPDATAHUB_API_KEY}`, 'Content-Type': 'application/json' }
        });

        if (response.data.status === "true") {
            const userRef = db.collection('users').doc(userId);
            await userRef.update({ balance: admin.firestore.FieldValue.increment(-parseFloat(service.price)) });
            await userRef.collection('transactions').add({
                type: 'Data',
                details: `${service.network} - ${service.plan}`,
                amount: parseFloat(service.price),
                status: 'success',
                date: admin.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('orders').add({
                userId,
                type: 'Data',
                details: { network: service.network, plan: service.plan, phone, amount: service.price },
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

// Electricity – user enters amount
app.post('/api/electricity', async (req, res) => {
    const { provider, meterNumber, amount, userId } = req.body;
    if (!provider || !meterNumber || !amount || !userId) return res.status(400).json({ error: 'Missing fields' });
    try {
        const response = await axios.post(`${CHEAPDATAHUB_BASE_URL}/electricity/purchase/`, {
            disco_id: { 'ikeja-electric':1, 'eko-electric':2, 'abuja-electric':3 }[provider],
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

// Cable TV – fixed price from service document
app.post('/api/cabletv', async (req, res) => {
    const { serviceId, smartCard, userId } = req.body;
    if (!serviceId || !smartCard || !userId) return res.status(400).json({ error: 'Missing fields' });
    try {
        const serviceDoc = await db.collection('services').doc(serviceId).get();
        if (!serviceDoc.exists) return res.status(404).json({ error: 'Service not found' });
        const service = serviceDoc.data();
        // Map provider to cable_id
        const cableIdMap = { dstv:1, gotv:2, startimes:3 };
        const cable_id = cableIdMap[service.provider];
        const plan_id = { basic:101, standard:102, premium:103 }[service.plan];

        const response = await axios.post(`${CHEAPDATAHUB_BASE_URL}/cable/purchase/`, {
            cable_id,
            smart_card_number: smartCard,
            plan_id
        }, {
            headers: { 'Authorization': `Bearer ${CHEAPDATAHUB_API_KEY}`, 'Content-Type': 'application/json' }
        });

        if (response.data.status === "true") {
            const userRef = db.collection('users').doc(userId);
            await userRef.update({ balance: admin.firestore.FieldValue.increment(-parseFloat(service.price)) });
            await userRef.collection('transactions').add({
                type: 'Cable TV',
                details: `${service.provider} - ${service.plan}`,
                amount: parseFloat(service.price),
                status: 'success',
                date: admin.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('orders').add({
                userId,
                type: 'Cable TV',
                details: { provider: service.provider, plan: service.plan, smartCard, amount: service.price },
                status: 'success',
                date: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        res.json(response.data);
    } catch (error) {
        console.error('Cable error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Cable subscription failed' });
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
app.put('/api/admin/services/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { price } = req.body;
    if (!price) return res.status(400).json({ error: 'Price required' });
    await db.collection('services').doc(id).update({ price });
    res.json({ success: true });
});

app.post('/api/admin/services', isAdmin, async (req, res) => {
    try {
        const serviceData = req.body;
        let id = `${serviceData.type}`;
        if (serviceData.network) id += `_${serviceData.network}`;
        if (serviceData.plan) id += `_${serviceData.plan}`;
        if (serviceData.provider) id += `_${serviceData.provider}`;
        id = id.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        serviceData.id = id;
        serviceData.createdAt = admin.firestore.FieldValue.serverTimestamp();
        await db.collection('services').doc(id).set(serviceData);
        res.json({ success: true, id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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