import express from 'express';
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: __dirname + '/.env' });
import docusign from "docusign-esign"
import fs from "fs";
const app = express();

const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/esign/healthcheck', (req, res) => {
  res.send('Application is working fine!');
});


app.get(["/esign", "/esign/home", "/"], async (req, res) => { 
  let dsApiClient = new docusign.ApiClient();
  dsApiClient.setBasePath(process.env.BASE_PATH);
  const results = await dsApiClient.requestJWTUserToken(process.env.INTEGRATION_KEY, process.env.USER_ID, ["signature"], fs.readFileSync(path.join(__dirname,'private.key')), 3600);
  console.log(results.body);

  //https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=600ecdd1-26dc-494d-8dd8-fc8b29c1189e&redirect_uri=http://localhost:3000/

  res.sendFile(path.join(__dirname, 'index.html'));
})

app.post("/esign", (req, res) => {
  console.log(req.body);
  res.send("success");
});

app.listen(port, () => {
  return console.log(`Express is listening at http://localhost:${port} USER ID  ${process.env.USER_ID}`);
});
