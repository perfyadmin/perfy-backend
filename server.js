const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Razorpay = require('razorpay');
const crypto = require('crypto');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Configure AWS
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const dynamodb = new AWS.DynamoDB();
const docClient = new AWS.DynamoDB.DocumentClient();
const JWT_SECRET = process.env.JWT_SECRET || 'perfy_secret_123';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Table Definitions
const tables = [
    {
        TableName: "Perfy_Users",
        KeySchema: [{ AttributeName: "email", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "email", AttributeType: "S" }],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    },
    {
        TableName: "Perfy_Companies",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    },
    {
        TableName: "Perfy_Assessments",
        KeySchema: [
            { AttributeName: "id", KeyType: "HASH" },
            { AttributeName: "employeeId", KeyType: "RANGE" }
        ],
        AttributeDefinitions: [
            { AttributeName: "id", AttributeType: "S" },
            { AttributeName: "employeeId", AttributeType: "S" }
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
    }
];

// Initialize Tables
async function initTables() {
    console.log("Checking DynamoDB tables...");
    const existingTables = await dynamodb.listTables().promise();
    
    for (const table of tables) {
        if (!existingTables.TableNames.includes(table.TableName)) {
            console.log(`Creating table ${table.TableName}...`);
            await dynamodb.createTable(table).promise();
            await dynamodb.waitFor('tableExists', { TableName: table.TableName }).promise();
            console.log(`Table ${table.TableName} created successfully.`);
        } else {
            console.log(`Table ${table.TableName} already exists.`);
        }
    }
}

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- ROUTES ---
const router = express.Router();

// Login
router.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await docClient.get({
            TableName: "Perfy_Users",
            Key: { email }
        }).promise();

        const user = result.Item;
        if (!user) return res.status(404).json({ message: "User not found" });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ message: "Invalid credentials" });

        const token = jwt.sign({ email: user.email, role: user.role, id: user.id }, JWT_SECRET, { expiresIn: '24h' });
        
        const { password: _, ...userData } = user;
        res.json({ token, user: userData });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Company Registration with Payment Verification
router.post('/auth/register-company', async (req, res) => {
    const { 
        name, address, type, industry, employeeCount, 
        ownerName, email, password, gstin,
        razorpay_payment_id, razorpay_order_id, razorpay_signature 
    } = req.body;

    try {
        // Verify Razorpay Signature (Optional but recommended)
        if (razorpay_payment_id && razorpay_signature) {
            const body = razorpay_order_id + "|" + razorpay_payment_id;
            const expectedSignature = crypto
                .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
                .update(body.toString())
                .digest("hex");
            
            if (expectedSignature !== razorpay_signature) {
                return res.status(400).json({ message: "Invalid payment signature" });
            }
        }

        // Create Company
        const companyId = `c${Math.floor(Math.random() * 1000000)}`;
        const company = {
            id: companyId,
            name,
            address,
            type,
            industry,
            gstin,
            maxEmployees: parseInt(employeeCount) || 0,
            employeeCount: 0,
            testsCompleted: 0,
            testsPending: 0,
            avgScore: 0,
            createdAt: new Date().toISOString(),
            uniqueCode: name.substring(0, 3).toUpperCase() + new Date().getFullYear(),
            paymentId: razorpay_payment_id
        };

        // Create Admin User
        const adminUser = {
            id: `u${Math.floor(Math.random() * 1000000)}`,
            name: ownerName,
            email,
            password: await bcrypt.hash(password, 10),
            role: 'company_admin',
            companyId: companyId,
            companyName: name,
            createdAt: new Date().toISOString()
        };

        await docClient.put({ TableName: "Perfy_Companies", Item: company }).promise();
        await docClient.put({ TableName: "Perfy_Users", Item: adminUser }).promise();

        res.status(201).json({ message: "Company registered successfully", companyId });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create Razorpay Order
router.post('/payments/create-order', async (req, res) => {
    const { amount } = req.body; // Amount in INR
    try {
        const options = {
            amount: amount * 100, // convert to paise
            currency: "INR",
            receipt: `rcpt_${Math.floor(Math.random() * 1000000)}`
        };
        const order = await razorpay.orders.create(options);
        res.json({ ...order, key_id: process.env.RAZORPAY_KEY_ID });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get All Companies (Super Admin)
router.get('/companies', authenticateToken, async (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    try {
        const result = await docClient.scan({ TableName: "Perfy_Companies" }).promise();
        res.json(result.Items);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get My Company Stats (Company Admin)
router.get('/company/my', authenticateToken, async (req, res) => {
    if (req.user.role !== 'company_admin') return res.sendStatus(403);
    try {
        const userRes = await docClient.get({ TableName: "Perfy_Users", Key: { email: req.user.email } }).promise();
        const companyId = userRes.Item.companyId;

        const result = await docClient.get({
            TableName: "Perfy_Companies",
            Key: { id: companyId }
        }).promise();
        res.json(result.Item);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get Employees for Company
router.get('/employees', authenticateToken, async (req, res) => {
    if (!['super_admin', 'company_admin'].includes(req.user.role)) return res.sendStatus(403);
    
    let companyId = req.query.companyId;
    if (req.user.role === 'company_admin') {
        const userRes = await docClient.get({ TableName: "Perfy_Users", Key: { email: req.user.email } }).promise();
        companyId = userRes.Item.companyId;
    }

    try {
        const result = await docClient.scan({
            TableName: "Perfy_Users",
            FilterExpression: "role = :r AND companyId = :c",
            ExpressionAttributeValues: { ":r": "employee", ":c": companyId }
        }).promise();
        res.json(result.Items);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get Assessments for Employee
router.get('/assessments', authenticateToken, async (req, res) => {
    const employeeId = req.query.employeeId || req.user.id;
    try {
        const result = await docClient.scan({
            TableName: "Perfy_Assessments",
            FilterExpression: "employeeId = :e",
            ExpressionAttributeValues: { ":e": employeeId }
        }).promise();
        res.json(result.Items);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get Recent Assessments (Super Admin)
router.get('/assessments/recent', authenticateToken, async (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    try {
        const result = await docClient.scan({
            TableName: "Perfy_Assessments",
            Limit: 10
        }).promise();
        
        // Fetch employee names for these assessments
        const enriched = await Promise.all(result.Items.map(async (asm) => {
            const userRes = await docClient.scan({
                TableName: "Perfy_Users",
                FilterExpression: "id = :id",
                ExpressionAttributeValues: { ":id": asm.employeeId }
            }).promise();
            const user = userRes.Items[0];
            return { ...asm, name: user?.name, companyName: user?.companyName };
        }));

        res.json(enriched);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create Company (Super Admin)
router.post('/companies', authenticateToken, async (req, res) => {
    if (req.user.role !== 'super_admin') return res.sendStatus(403);
    const company = {
        ...req.body,
        id: `c${Math.floor(Math.random() * 1000000)}`,
        createdAt: new Date().toISOString(),
        uniqueCode: req.body.name.substring(0, 3).toUpperCase() + new Date().getFullYear(),
        employeeCount: 0,
        testsCompleted: 0,
        testsPending: 0,
        avgScore: 0
    };
    try {
        await docClient.put({ TableName: "Perfy_Companies", Item: company }).promise();
        res.status(201).json(company);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Add Employee (Company Admin)
router.post('/employees', authenticateToken, async (req, res) => {
    if (req.user.role !== 'company_admin') return res.sendStatus(403);
    
    const userRes = await docClient.get({ TableName: "Perfy_Users", Key: { email: req.user.email } }).promise();
    const companyId = userRes.Item.companyId;
    const companyName = userRes.Item.companyName;

    const employee = {
        ...req.body,
        id: `e${Math.floor(Math.random() * 1000000)}`,
        role: 'employee',
        companyId,
        companyName,
        password: await bcrypt.hash('emp123', 10), // Default password
        testStatus: 'pending'
    };

    try {
        // Check Quota
        const companyRes = await docClient.get({ TableName: "Perfy_Companies", Key: { id: companyId } }).promise();
        const company = companyRes.Item;
        
        if (company && company.maxEmployees && company.employeeCount >= company.maxEmployees) {
            return res.status(403).json({ message: `Employee quota reached (${company.maxEmployees}). Please upgrade your plan.` });
        }

        await docClient.put({ TableName: "Perfy_Users", Item: employee }).promise();
        
        // Update employee count in company table
        await docClient.update({
            TableName: "Perfy_Companies",
            Key: { id: companyId },
            UpdateExpression: "SET employeeCount = employeeCount + :inc, testsPending = testsPending + :inc",
            ExpressionAttributeValues: { ":inc": 1 }
        }).promise();

        const { password: _, ...employeeData } = employee;
        res.status(201).json(employeeData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Submit Assessment
router.post('/assessments', authenticateToken, async (req, res) => {
    const assessment = {
        ...req.body,
        id: `asm_${Math.floor(Math.random() * 1000000)}`,
        employeeId: req.user.id,
        completedAt: new Date().toISOString()
    };
    try {
        await docClient.put({ TableName: "Perfy_Assessments", Item: assessment }).promise();
        
        // Update user status and score
        await docClient.update({
            TableName: "Perfy_Users",
            Key: { email: req.user.email },
            UpdateExpression: "SET testStatus = :s, overallScore = :sc, classification = :cl",
            ExpressionAttributeValues: { ":s": "completed", ":sc": req.body.overallScore, ":cl": req.body.classification }
        }).promise();

        // Update company stats (Simplified: just increment completed)
        const userRes = await docClient.get({ TableName: "Perfy_Users", Key: { email: req.user.email } }).promise();
        const companyId = userRes.Item.companyId;
        
        await docClient.update({
            TableName: "Perfy_Companies",
            Key: { id: companyId },
            UpdateExpression: "SET testsCompleted = testsCompleted + :inc, testsPending = testsPending - :inc",
            ExpressionAttributeValues: { ":inc": 1 }
        }).promise();

        res.status(201).json(assessment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.use('/api', router);

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    try {
        await initTables();
        console.log("DynamoDB initialization complete.");
    } catch (error) {
        console.error("Error initializing DynamoDB:", error);
    }
});
