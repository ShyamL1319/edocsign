import express from 'express';
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: __dirname + '/.env' });
import docusign from "docusign-esign"
import fs from "fs";
import session from 'express-session';
const app = express();

const port = 3000;

app.use(session({
  secret: "secret-session-key",
  resave: true,
  saveUninitialized : true
}))
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/esign/healthcheck', (req, res) => {
  res.send('Application is working fine!');
});

async function checkToken(req) { 
  if (req.session.access_token && Date.now() < req.session.expires_at) {
    console.log("reusing the access-token", req.session.access_token);
  } else { 
    console.log("generating a new access token");
    let dsApiClient = new docusign.ApiClient();
    dsApiClient.setBasePath(process.env.BASE_PATH);
    const results = await dsApiClient.requestJWTUserToken(process.env.INTEGRATION_KEY, process.env.USER_ID, ["signature"], fs.readFileSync(path.join(__dirname,'private.key')), 3600);
    console.log(results.body);
    req.session.access_token = results.body.access_token;
    req.session.expires_at = (Date.now()  + (results.body.expires_in - 60) * 1000);
    //https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=600ecdd1-26dc-494d-8dd8-fc8b29c1189e&redirect_uri=http://localhost:3000/
  }
}

app.get(["/esign", "/esign/home", "/"], async (req:any, res:any) => { 
  await checkToken(req);
  res.sendFile(path.join(__dirname, 'index.html'));
})

app.post("/esign", (req, res) => {
  console.log(req.body);
  res.send("success");
});

app.listen(port, () => {
  return console.log(`Express is listening at http://localhost:${port} USER ID  ${process.env.USER_ID}`);
});
