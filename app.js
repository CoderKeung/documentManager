const express = require("express");
const app = express();
const port = 8000;
const routes = require("./router");


app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'X-File-Name');
  next();
});

// 定义 API 路由和处理程序
app.use('/api', routes);

// 启动服务器
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});