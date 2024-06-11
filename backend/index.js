const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const moment = require('moment');  

const app = express();
const PORT = process.env.PORT || 5000;
require('dotenv').config()


app.use(cors());
app.use(express.json());


// const MONGOURL = process.env.MONGO_URL

// MONGOURL Connection 

mongoose.connect('mongodb+srv://rahulchiluka2511:uGnVdiedbSkFaPtd@cluster0.9zb9wc6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');

const transactionSchema = new mongoose.Schema({
    title: String,
    description: String,
    price: Number,
    dateOfSale: Date,
    category: String,
    sold: Boolean
});

const Transaction = mongoose.model('Transaction', transactionSchema);


// Route to initialize the database

app.get('/api/init', async (req, res) => {
    try {
      const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
      const transactions = response.data;
  
      await Transaction.deleteMany({});
      await Transaction.insertMany(transactions);
  
      res.status(200).send('Database initialized with seed data');
    } catch (error) {
      res.status(500).send('Error initializing database');
    }
  });



// Route to get transactions 

app.get('/api/transactions', async (req, res) => {
    const { month, search, page = 1, perPage = 10 } = req.query;
  
    const query = {};
    if (month) {
      const startDate = new Date(`2022-${month}-01`);
      const endDate = new Date(`2022-${Number(month) + 1}-01`);
      endDate.setMonth(startDate.getMonth() + 1); 
      query.dateOfSale = { $gte: startDate, $lt: endDate };
    }
  

    if (search) {
        const regex = new RegExp(search, 'i'); 
        query.$or = [
            { title: regex },
            { description: regex },
            { price: regex }
        ];
    }

    console.log('Query:', JSON.stringify(query, null, 2));  

    try {
      const totalTransactions = await Transaction.countDocuments(query);
      const transactions = await Transaction.find(query)
        .skip((page - 1) * perPage)
        .limit(Number(perPage));
  
      const totalPages = Math.ceil(totalTransactions / perPage);
  
      const response = {
        transactions,
        pagination: {
          currentPage: Number(page),
          perPage: Number(perPage),
          totalPages,
          totalTransactions,
          nextPage: Number(page) < totalPages ? Number(page) + 1 : null,
          prevPage: Number(page) > 1 ? Number(page) - 1 : null
        }
      };
  
      res.status(200).json(response);
    } catch (error) {
      res.status(500).send('Error fetching transactions');
    }
  });
  



// Route to get statistics

app.get('/api/statistics', async (req, res) => {
    const { month } = req.query;
  
    if (!month) {
      return res.status(400).send('Month is required');
    }
  
    const startDate = new Date(`2022-${month}-01`);
    const endDate = new Date(`2022-${Number(month) + 1}-01`);
    const query = { dateOfSale: { $gte: startDate, $lt: endDate } };
  
    try {
      const totalSaleAmount = await Transaction.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: "$price" } } }
      ]);
  
      const totalSoldItems = await Transaction.countDocuments({ ...query, sold: true });
      const totalNotSoldItems = await Transaction.countDocuments({ ...query, sold: false });
  
      res.status(200).json({
        totalSaleAmount: totalSaleAmount[0]?.total || 0,
        totalSoldItems,
        totalNotSoldItems
      });
    } catch (error) {
      res.status(500).send('Error fetching statistics');
    }
});
  



// Route to get bar-chart

app.get('/api/bar-chart', async (req, res) => {
  const { month } = req.query;

  if (!month) {
    return res.status(400).send('Month is required');
  }

  const startDate = new Date(`2022-${month}-01`);
  const endDate = new Date(`2022-${Number(month) + 1}-01`);
  const query = { dateOfSale: { $gte: startDate, $lt: endDate } };

  const priceRanges = [
    { range: '0-100', min: 0, max: 100 },
    { range: '101-200', min: 101, max: 200 },
    { range: '201-300', min: 201, max: 300 },
    { range: '301-400', min: 301, max: 400 },
    { range: '401-500', min: 401, max: 500 },
    { range: '501-600', min: 501, max: 600 },
    { range: '601-700', min: 601, max: 700 },
    { range: '701-800', min: 701, max: 800 },
    { range: '801-900', min: 801, max: 900 },
    { range: '901-above', min: 901, max: Infinity }
  ];

  try {
    const results = await Promise.all(priceRanges.map(async (range) => {
      const count = await Transaction.countDocuments({
        ...query,
        price: { $gte: range.min, $lt: range.max }
      });
      return { range: range.range, count };
    }));

    res.status(200).json(results);
  } catch (error) {
    res.status(500).send('Error fetching bar chart data');
  }
});



// Route to get data for pie chart

app.get('/api/pie-chart', async (req, res) => {
  const { month } = req.query;

  if (!month) {
    return res.status(400).send('Month is required');
  }

  const startDate = new Date(`2022-${month}-01`);
  const endDate = new Date(`2022-${Number(month) + 1}-01`);
  const query = { dateOfSale: { $gte: startDate, $lt: endDate } };

  try {
    const categories = await Transaction.aggregate([
      { $match: query },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $project: { category: "$_id", count: 1, _id: 0 } }
    ]);
    console.log(`${month} pie-chart`)
    res.status(200).json(categories);
  } catch (error) {
    console.log("pie-chart fail")
    res.status(500).send('Error fetching pie chart data');
  }
});

// Combined API 

app.get('/api/combined', async (req, res) => {
    try {
        const { month } = req.query;
        const [transactions, statistics, barChart, pieChart] = await Promise.all([
            axios.get(`http://localhost:${PORT}/api/transactions?month=${month}`),
            axios.get(`http://localhost:${PORT}/api/statistics?month=${month}`),
            axios.get(`http://localhost:${PORT}/api/bar-chart?month=${month}`),
            axios.get(`http://localhost:${PORT}/api/pie-chart?month=${month}`)
        ]);

        res.json({
            transactions: transactions.data,
            statistics: statistics.data,
            barChart: barChart.data,
            pieChart: pieChart.data
        });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
