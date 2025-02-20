const os = require('os');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const pptxToHtml = require('./pptxRenderer');

const app = express();
const PORT = 3001;
const JWT_SECRET = 'your-secret-key'; // Replace with a secure key in production

// Middleware
app.use(express.json());
app.use(express.static('public')); // Serve front-end files
app.use('/temp', express.static(path.join(__dirname, 'temp')));
const upload = multer({ dest: 'uploads/' });

// MongoDB connection
mongoose.connect('mongodb://localhost/training_platform')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// ----- Mongoose Schemas -----
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['superadmin', 'companyadmin', 'user'], required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
});

const CompanySchema = new mongoose.Schema({
  name: { type: String, required: true },
});

const TrainingModuleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  slidesHtml: [String],
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
  certificateTemplatePath: String,
});

const ExamSchema = new mongoose.Schema({
  moduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingModule', required: true },
  questions: [{
    question: String,
    options: [String],
    correctAnswer: Number,
  }],
});

const CompletionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  moduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingModule', required: true },
  examScore: Number,
  passed: Boolean,
});

const User = mongoose.model('User', UserSchema);
const Company = mongoose.model('Company', CompanySchema);
const TrainingModule = mongoose.model('TrainingModule', TrainingModuleSchema);
const Exam = mongoose.model('Exam', ExamSchema);
const Completion = mongoose.model('Completion', CompletionSchema);

// ----- Authentication & Authorization Middleware -----
const authenticateToken = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) return res.status(401).json({ error: 'Invalid token' });
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
};

// ----- Routes -----
// Register endpoint
app.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Missing fields' });
  if (!['superadmin', 'companyadmin', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const existingUser = await User.findOne({ email });
  if (existingUser) return res.status(400).json({ error: 'Email already registered' });
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ name, email, password: hashedPassword, role, companyId: null });
  await user.save();
  res.status(201).json({ message: 'User registered successfully' });
});

// Login endpoint
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, role: user.role, companyId: user.companyId });
});

// Companies
app.get('/companies', authenticateToken, restrictTo('superadmin'), async (req, res) => {
  try {
    const companies = await Company.find();
    const companiesWithCounts = await Promise.all(companies.map(async (company) => {
      const userCount = await User.countDocuments({ companyId: company._id });
      const moduleCount = await TrainingModule.countDocuments({ companyId: company._id });
      return { _id: company._id, name: company.name, userCount, moduleCount };
    }));
    res.json(companiesWithCounts);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

app.get('/companies/:id', authenticateToken, restrictTo('superadmin'), async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json({ _id: company._id, name: company.name });
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

app.post('/companies', authenticateToken, restrictTo('superadmin'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const company = new Company({ name });
  await company.save();
  res.status(201).json(company);
});

// Users
app.get('/users', authenticateToken, async (req, res) => {
  try {
    const query = req.user.role === 'superadmin' ? {} : { companyId: req.user.companyId };
    const users = await User.find(query);
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/users', authenticateToken, async (req, res) => {
  const { name, email, password, role, companyId } = req.body;
  console.log('Received POST /users:', { name, email, password, role, companyId });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      companyId,
    });
    await user.save();
    res.status(201).json({ message: 'User added successfully!' });
  } catch (error) {
    console.error('Error adding user:', error);
    if (error.code === 11000) {
      res.status(400).json({ error: 'Email already in use' });
    } else {
      res.status(500).json({ error: 'Failed to add user' });
    }
  }
});

// Modules
app.get('/modules', authenticateToken, async (req, res) => {
  try {
    const query = req.user.role === 'superadmin' ? {} : { companyId: req.user.companyId };
    const modules = await TrainingModule.find(query);
    res.json(modules);
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

app.get('/modules/:id', authenticateToken, async (req, res) => {
  try {
    const module = await TrainingModule.findById(req.params.id);
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }
    if (req.user.role !== 'superadmin' && !req.user.companyId?.equals(module.companyId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    res.json(module);
  } catch (error) {
    console.error('Error fetching module:', error);
    res.status(500).json({ error: 'Failed to fetch module' });
  }
});

app.post('/modules', authenticateToken, restrictTo('superadmin', 'companyadmin'), upload.single('file'), async (req, res) => {
  const { title, companyId } = req.body;
  if (!req.file || path.extname(req.file.originalname) !== '.pptx') return res.status(400).json({ error: 'A valid .pptx file is required' });
  const effectiveCompanyId = req.user.role === 'superadmin' ? companyId : req.user.companyId;
  if (!effectiveCompanyId) return res.status(400).json({ error: 'Company ID required' });
  const pptxPath = req.file.path;
  try {
    const htmlSlides = await pptxToHtml(pptxPath);
    console.log(`Module has ${htmlSlides.length} slides`);
    for (let i = 0; i < htmlSlides.length; i++) {
      console.log(`Slide ${i+1} HTML: ${htmlSlides[i].substr(0, 50)}...`);
    }
    const module = new TrainingModule({
      title: title?.trim() || `Untitled Module - ${new Date().toISOString().split('T')[0]}`,
      companyId: effectiveCompanyId,
      slidesHtml: htmlSlides,
    });
    await module.save();
    fs.unlinkSync(pptxPath);
    res.status(201).json(module);
  } catch (error) {
    console.error('Module upload error:', error);
    if (fs.existsSync(pptxPath)) fs.unlinkSync(pptxPath);
    res.status(500).json({ error: `Failed to process module: ${error.message}` });
  }
});

app.patch('/modules/:id', authenticateToken, restrictTo('superadmin', 'companyadmin'), async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const module = await TrainingModule.findById(req.params.id);
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }
    if (req.user.role !== 'superadmin' && !req.user.companyId?.equals(module.companyId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    module.title = title;
    await module.save();
    res.json(module);
  } catch (error) {
    console.error('Error updating module:', error);
    res.status(500).json({ error: 'Failed to update module' });
  }
});

// Completions
app.get('/completions/company/:companyId', authenticateToken, restrictTo('superadmin', 'companyadmin'), async (req, res) => {
  try {
    const companyId = req.params.companyId;
    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if (req.user.role !== 'superadmin' && !req.user.companyId?.equals(companyId)) return res.status(403).json({ error: 'Forbidden' });
    const completions = await Completion.find({}).populate('userId', 'name').populate('moduleId', 'title');
    const filteredCompletions = completions.filter(c => c.userId.companyId?.toString() === companyId.toString());
    res.json(filteredCompletions.map(c => ({
      userId: c.userId._id,
      userName: c.userId.name,
      moduleId: c.moduleId._id,
      moduleTitle: c.moduleId.title,
      passed: c.passed,
      examScore: c.examScore,
    })));
  } catch (error) {
    console.error('Error fetching company completions:', error);
    res.status(500).json({ error: 'Failed to fetch completions' });
  }
});

// Server Startup
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));