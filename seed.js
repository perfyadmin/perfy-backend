const AWS = require('aws-sdk');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

// Configure AWS
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const docClient = new AWS.DynamoDB.DocumentClient();

const users = [
    { email: "admin@perfy.com", password: "admin123", role: "super_admin", name: "Admin User", id: "u1" },
    { email: "manager@perfy.com", password: "company123", role: "company_admin", name: "TechCorp Manager", id: "u2", companyId: "c1", companyName: "TechCorp Solutions" },
    { email: "employee@perfy.com", password: "emp123", role: "employee", name: "Rahul Sharma", id: "e1", employeeId: "EMP001", companyId: "c1", companyName: "TechCorp Solutions" }
];

const companies = [
    { id: "c1", name: "TechCorp Solutions", employeeCount: 45, testsCompleted: 32, testsPending: 13, avgScore: 78, createdAt: "2024-01-15", uniqueCode: "TECH2024", contactEmail: "hr@techcorp.com", industry: "Technology" },
    { id: "c2", name: "Global Finance Ltd", employeeCount: 120, testsCompleted: 95, testsPending: 25, avgScore: 72, createdAt: "2024-02-20", uniqueCode: "GFIN2024", contactEmail: "hr@globalfin.com", industry: "Finance" },
    { id: "c3", name: "HealthCare Plus", employeeCount: 67, testsCompleted: 50, testsPending: 17, avgScore: 81, createdAt: "2024-03-10", uniqueCode: "HCP2024", contactEmail: "hr@healthcare.com", industry: "Healthcare" },
    { id: "c4", name: "EduTech Academy", employeeCount: 30, testsCompleted: 28, testsPending: 2, avgScore: 85, createdAt: "2024-04-05", uniqueCode: "EDU2024", contactEmail: "hr@edutech.com", industry: "Education" },
    { id: "c5", name: "RetailMax Group", employeeCount: 89, testsCompleted: 60, testsPending: 29, avgScore: 69, createdAt: "2024-05-12", uniqueCode: "RMX2024", contactEmail: "hr@retailmax.com", industry: "Retail" },
    { id: "c6", name: "AutoDrive Inc", employeeCount: 55, testsCompleted: 40, testsPending: 15, avgScore: 74, createdAt: "2024-06-01", uniqueCode: "ADI2024", contactEmail: "hr@autodrive.com", industry: "Automotive" }
];

const employees = [
    { id: "e1", employeeId: "EMP001", name: "Rahul Sharma", email: "rahul@techcorp.com", companyId: "c1", companyName: "TechCorp Solutions", testStatus: "completed", overallScore: 82, classification: "High Potential (HiPo)", completedAt: "2024-03-15", sectionScores: { Personality: 85, "Emotional Intelligence": 78, "Cognitive Ability": 90, "Situational Judgment": 82, Motivation: 80, "Culture Fit": 75, "Behavioral Risk": 88, Leadership: 79, Communication: 83, "Learning Agility": 80 } },
    { id: "e2", employeeId: "EMP002", name: "Priya Patel", email: "priya@techcorp.com", companyId: "c1", companyName: "TechCorp Solutions", testStatus: "completed", overallScore: 91, classification: "High Potential (HiPo)", completedAt: "2024-03-14", sectionScores: { Personality: 92, "Emotional Intelligence": 88, "Cognitive Ability": 95, "Situational Judgment": 90, Motivation: 93, "Culture Fit": 85, "Behavioral Risk": 90, Leadership: 92, Communication: 91, "Learning Agility": 94 } },
    { id: "e4", employeeId: "EMP004", name: "Sneha Reddy", email: "sneha@globalfin.com", companyId: "c2", companyName: "Global Finance Ltd", testStatus: "completed", overallScore: 65, classification: "Average Performer", completedAt: "2024-03-12", sectionScores: { Personality: 68, "Emotional Intelligence": 62, "Cognitive Ability": 70, "Situational Judgment": 60, Motivation: 65, "Culture Fit": 72, "Behavioral Risk": 58, Leadership: 60, Communication: 67, "Learning Agility": 68 } },
    { id: "e6", employeeId: "EMP006", name: "Ananya Gupta", email: "ananya@healthcare.com", companyId: "c3", companyName: "HealthCare Plus", testStatus: "completed", overallScore: 88, classification: "High Potential (HiPo)", completedAt: "2024-03-16", sectionScores: { Personality: 90, "Emotional Intelligence": 92, "Cognitive Ability": 85, "Situational Judgment": 88, Motivation: 86, "Culture Fit": 90, "Behavioral Risk": 85, Leadership: 88, Communication: 92, "Learning Agility": 84 } },
    { id: "e7", employeeId: "EMP007", name: "Karan Mehta", email: "karan@edutech.com", companyId: "c4", companyName: "EduTech Academy", testStatus: "completed", overallScore: 42, classification: "Risk Candidate", completedAt: "2024-03-11", sectionScores: { Personality: 45, "Emotional Intelligence": 38, "Cognitive Ability": 50, "Situational Judgment": 35, Motivation: 40, "Culture Fit": 48, "Behavioral Risk": 30, Leadership: 42, Communication: 45, "Learning Agility": 47 } },
    { id: "e8", employeeId: "EMP008", name: "Deepika Nair", email: "deepika@retailmax.com", companyId: "c5", companyName: "RetailMax Group", testStatus: "completed", overallScore: 76, classification: "Average Performer", completedAt: "2024-03-13", sectionScores: { Personality: 78, "Emotional Intelligence": 74, "Cognitive Ability": 80, "Situational Judgment": 72, Motivation: 76, "Culture Fit": 70, "Behavioral Risk": 82, Leadership: 74, Communication: 78, "Learning Agility": 76 } },
    { id: "e10", employeeId: "EMP010", name: "Meera Joshi", email: "meera@globalfin.com", companyId: "c2", companyName: "Global Finance Ltd", testStatus: "completed", overallScore: 71, classification: "Average Performer", completedAt: "2024-03-18", sectionScores: { Personality: 72, "Emotional Intelligence": 68, "Cognitive Ability": 75, "Situational Judgment": 70, Motivation: 73, "Culture Fit": 68, "Behavioral Risk": 74, Leadership: 70, Communication: 72, "Learning Agility": 68 } },
    { id: "e11", employeeId: "EMP011", name: "Arjun Rao", email: "arjun@healthcare.com", companyId: "c3", companyName: "HealthCare Plus", testStatus: "completed", overallScore: 55, classification: "Average Performer", completedAt: "2024-03-17", sectionScores: { Personality: 58, "Emotional Intelligence": 52, "Cognitive Ability": 60, "Situational Judgment": 50, Motivation: 55, "Culture Fit": 58, "Behavioral Risk": 48, Leadership: 52, Communication: 56, "Learning Agility": 61 } },
    { id: "e12", employeeId: "EMP012", name: "Nisha Agarwal", email: "nisha@autodrive.com", companyId: "c6", companyName: "AutoDrive Inc", testStatus: "completed", overallScore: 79, classification: "High Potential (HiPo)", completedAt: "2024-03-19", sectionScores: { Personality: 82, "Emotional Intelligence": 78, "Cognitive Ability": 80, "Situational Judgment": 76, Motivation: 80, "Culture Fit": 78, "Behavioral Risk": 82, Leadership: 76, Communication: 80, "Learning Agility": 78 } }
];

async function seed() {
    console.log("Seeding data...");

    // Seed Users
    for (const user of users) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        await docClient.put({
            TableName: "Perfy_Users",
            Item: { ...user, password: hashedPassword }
        }).promise();
        console.log(`Seeded user: ${user.email}`);
    }

    // Seed Companies
    for (const company of companies) {
        await docClient.put({
            TableName: "Perfy_Companies",
            Item: company
        }).promise();
        console.log(`Seeded company: ${company.name}`);
    }

    // Seed Assessments (based on completed employees)
    for (const emp of employees) {
        const assessment = {
            id: `asm_${Math.floor(Math.random() * 1000000)}`,
            employeeId: emp.employeeId,
            companyId: emp.companyId,
            status: emp.testStatus,
            overallScore: emp.overallScore,
            classification: emp.classification,
            completedAt: emp.completedAt,
            sectionScores: emp.sectionScores
        };
        await docClient.put({
            TableName: "Perfy_Assessments",
            Item: assessment
        }).promise();
        console.log(`Seeded assessment for: ${emp.name}`);
    }

    // Add remaining employees as users with "employee" role
    const allEmployees = [
        ...employees,
        { id: "e3", employeeId: "EMP003", name: "Amit Kumar", email: "amit@globalfin.com", companyId: "c2", companyName: "Global Finance Ltd", testStatus: "in_progress" },
        { id: "e5", employeeId: "EMP005", name: "Vikram Singh", email: "vikram@healthcare.com", companyId: "c3", companyName: "HealthCare Plus", testStatus: "pending" },
        { id: "e9", employeeId: "EMP009", name: "Rohan Desai", email: "rohan@techcorp.com", companyId: "c1", companyName: "TechCorp Solutions", testStatus: "in_progress" }
    ];

    for (const emp of allEmployees) {
        // Skip rahul if already seeded as demo
        if (emp.email === "rahul@techcorp.com") continue;

        const hashedPassword = await bcrypt.hash("emp123", 10);
        await docClient.put({
            TableName: "Perfy_Users",
            Item: {
                email: emp.email,
                password: hashedPassword,
                role: "employee",
                name: emp.name,
                id: emp.id,
                employeeId: emp.employeeId,
                companyId: emp.companyId,
                companyName: emp.companyName
            }
        }).promise();
        console.log(`Seeded employee user: ${emp.email}`);
    }

    console.log("Seeding complete!");
}

seed().catch(err => {
    console.error("Error seeding data:", err);
});
