import express from 'express';
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: __dirname + '/.env' });
const docusign = require("docusign-esign")

import {
  ApiClient,
  Envelope,
  Configuration,
  EnvelopeDefinition,
  TemplateRole,
  AuthenticationApi,
  EnvelopesApi
} from "docusign-esign";
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

async function getEnvelopsApi(req) { //basePath:  "https://demo.docusign.net/restapi"
  let client = new ApiClient();
  client.setBasePath(process.env.BASE_PATH);
  client.addDefaultHeader('Authorization', 'Bearer ' + req.session.access_token);
  return new EnvelopesApi(client);
}

function makeEnvelope(name , email){
    // Create the envelope definition
    let env = new docusign.EnvelopeDefinition();
    env.templateId = process.env.TEMPLATE_ID;
    let signer1 = docusign.TemplateRole.constructFromObject({
      email: email,
      name: name,
      clientUserId : process.env.CLIENT_USER_ID,
      roleName: 'Applicant'});
    let cc1 = new docusign.TemplateRole();
    cc1.email = email;
    cc1.name = name;
    cc1.roleName = 'cc';

    // Add the TemplateRole objects to the envelope object
    env.templateRoles = [signer1, cc1];
    env.status = "sent"; // We want the envelope to be sent
    return env;
}

function makeRecipientViewRequest(name, email, clientUserId) {
    // Data for this method
    // args.dsReturnUrl 
    // args.signerEmail 
    // args.signerName 
    // args.signerClientId
    // args.dsPingUrl 

    let viewRequest = new docusign.RecipientViewRequest();

    // Set the url where you want the recipient to go once they are done signing
    // should typically be a callback route somewhere in your app.
    // The query parameter is included as an example of how
    // to save/recover state information during the redirect to
    // the DocuSign signing ceremony. It's usually better to use
    // the session mechanism of your web framework. Query parameters
    // can be changed/spoofed very easily.
    viewRequest.returnUrl = "http://localhost:3000/success";//args.dsReturnUrl + "?state=123";

    // How has your app authenticated the user? In addition to your app's
    // authentication, you can include authenticate steps from DocuSign.
    // Eg, SMS authentication
    viewRequest.authenticationMethod = 'none';
    
    // Recipient information must match embedded recipient info
    // we used to create the envelope.
    viewRequest.email = email;
    viewRequest.userName =  name;
    viewRequest.clientUserId = process.env.CLIENT_USER_ID;

    // DocuSign recommends that you redirect to DocuSign for the
    // Signing Ceremony. There are multiple ways to save state.
    // To maintain your application's session, use the pingUrl
    // parameter. It causes the DocuSign Signing Ceremony web page
    // (not the DocuSign server) to send pings via AJAX to your
    // app,
    // viewRequest.pingFrequency = 600; // seconds
    // NOTE: The pings will only be sent if the pingUrl is an https address
    // viewRequest.pingUrl = args.dsPingUrl; // optional setting

    return viewRequest
}


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

app.get("/", async (req:any, res:any) => { 
  await checkToken(req);
  res.sendFile(path.join(__dirname, 'index.html'));
})

function createTabs(name, email, company_name) { 
  let list1 = docusign.List.constructFromObject({
        value: "green", documentId: "1", pageNumber: "1", tabLabel: "list"});

    // Checkboxes
    let check1 = docusign.Checkbox.constructFromObject({
            tabLabel: 'ckAuthorization', selected: "true"})
      , check3 = docusign.Checkbox.constructFromObject({
            tabLabel: 'ckAgreement', selected: "true"});
    // The NOde.js SDK has a bug so it cannot create a Number tab at this time.
    //number1 = docusign.Number.constructFromObject({
    //    tabLabel: "numbersOnly", value: '54321'});
    let radioGroup = docusign.RadioGroup.constructFromObject({
            groupName: "radio1",
            // You only need to provide the radio entry for the entry you're selecting
            radios:
                [docusign.Radio.constructFromObject({value: "white", selected: "true"})]
    });
    let text = docusign.Text.constructFromObject({
            tabLabel: "text", value: "Jabberwocky!"});

    // We can also add a new tab (field) to the ones already in the template:
    let textExtra = docusign.Text.constructFromObject({
            document_id: "1", page_number: "1",
            x_position: "280", y_position: "172",
            font: "helvetica", font_size: "size14", tab_label: "added text field",
            height: "23", width: "84", required: "false",
            bold: 'true', value: name,
            locked: 'false', tab_id: 'name'});

    // Pull together the existing and new tabs in a Tabs object:
    let tabs = docusign.Tabs.constructFromObject({
        checkboxTabs: [check1, check3], // numberTabs: [number1],
        radioGroupTabs: [radioGroup], textTabs: [text, textExtra],
        listTabs: [list1]
    });
    // Create the template role elements to connect the signer and cc recipients
    // to the template
    let signer = docusign.TemplateRole.constructFromObject({
            email: email, name: name,
            roleName: 'signer',
            clientUserId: process.env.CLIENT_USER_ID, // change the signer to be embedded
            tabs: tabs // Set tab values
    });
    // Create a cc template role.
    let cc = docusign.TemplateRole.constructFromObject({
            email: email, name: name,
            roleName: 'cc'
    });
    // Add the TemplateRole objects to the envelope object
    envelopeDefinition.templateRoles = [signer, cc];
    // Create an envelope custom field to save the our application's
    // data about the envelope
    let customField = docusign.TextCustomField.constructFromObject({
            name: 'app metadata item',
            required: 'false',
            show: 'true', // Yes, include in the CoC
            value: '1234567'})
      , customFields = docusign.CustomFields.constructFromObject({
            textCustomFields: [customField]});
    envelopeDefinition.customFields = customFields;

    return envelopeDefinition;
}

app.post("/esign", async (req:any, res:any) => {
  await checkToken(req);
  console.log("after checkTooken", req.body);
  let dsApiClient = new docusign.ApiClient();
  dsApiClient.setBasePath(process.env.BASE_PATH);
  dsApiClient.addDefaultHeader('Authorization', 'Bearer ' + req.session.access_token);
  let envelopesApi = await getEnvelopsApi(req);
  let envelope = makeEnvelope(req.body.name, req.body.email);
  let results = await envelopesApi.createEnvelope(
    process.env.ACCOUNT_ID, { envelopeDefinition: envelope });
  console.log("envelop results", results);
    // Create the recipient view, the Signing Ceremony
  let viewRequest = makeRecipientViewRequest(req.body.name, req.body.email, "");
  // Call the CreateRecipientView API
  // Exceptions will be caught by the calling function
  let results2 =  await envelopesApi.createRecipientView(process.env.ACCOUNT_ID, results.envelopeId,
      {recipientViewRequest: viewRequest});
    console.log("view result exports",results2)
  //console.log({envelopeId: envelopeId, redirectUrl: results.url})
  res.redirect(results2.url);
  //res.send("success");
});


app.get("/success", (req, res) => { 
    res.send("success!")
})

app.listen(port, () => {
  return console.log(`Express is listening at http://localhost:${port} USER ID  ${process.env.USER_ID}`);
});


// const express = require("express");
// const path = require("path");
// const bodyParser = require("body-parser");
// const dotenv = require("dotenv");
// dotenv.config({ path: __dirname + '/.env' });
// const docusign = require("docusign-esign");
// const fs = require("fs");
// const session = require("express-session");

// const app = express();
// app.use(bodyParser.urlencoded({extended: true}));
// app.use(session({
//    secret: "dfsf94835asda",
//    resave: true,
//    saveUninitialized: true,
// }));

// app.post("/esign", async (request, response) => {
//    await checkToken(request);
//    let envelopesApi = getEnvelopesApi(request);
//    let envelope = makeEnvelope(request.body.name, request.body.email, request.body.company);

//    let results = await envelopesApi.createEnvelope(
//        process.env.ACCOUNT_ID, {envelopeDefinition: envelope});
//    console.log("envelope results ", results);
// // Create the recipient view, the Signing Ceremony
//    let viewRequest = makeRecipientViewRequest(request.body.name, request.body.email);
//    results = await envelopesApi.createRecipientView(process.env.ACCOUNT_ID, results.envelopeId,
//        {recipientViewRequest: viewRequest});

//    response.redirect(results.url);
// });

// function getEnvelopesApi(request) {
//    let dsApiClient = new docusign.ApiClient();
//    dsApiClient.setBasePath(process.env.BASE_PATH);
//    dsApiClient.addDefaultHeader('Authorization', 'Bearer ' + request.session.access_token);
//    return new docusign.EnvelopesApi(dsApiClient);
// }

// function makeEnvelope(name, email, company){
//    let env = new docusign.EnvelopeDefinition();
//    env.templateId = process.env.TEMPLATE_ID;
//    let text = docusign.Text.constructFromObject({
//       tabLabel: "company_name", value: company});

//    // Pull together the existing and new tabs in a Tabs object:
//    let tabs = docusign.Tabs.constructFromObject({
//       textTabs: [text],
//    });

//    let signer1 = docusign.TemplateRole.constructFromObject({
//       email: email,
//       name: name,
//       tabs: tabs,
//       clientUserId: process.env.CLIENT_USER_ID,
//       roleName: 'Applicant'});

//    env.templateRoles = [signer1];
//    env.status = "sent";

//    return env;
// }

// function makeRecipientViewRequest(name, email) {

//    let viewRequest = new docusign.RecipientViewRequest();

//    viewRequest.returnUrl = "http://localhost:8000/success";
//    viewRequest.authenticationMethod = 'none';

//    // Recipient information must match embedded recipient info
//    // we used to create the envelope.
//    viewRequest.email = email;
//    viewRequest.userName = name;
//    viewRequest.clientUserId = process.env.CLIENT_USER_ID;

//    return viewRequest
// }


// async function checkToken(request) {
//    if (request.session.access_token && Date.now() < request.session.expires_at) {
//       console.log("re-using access_token ", request.session.access_token);
//    } else {
//       console.log("generating a new access token");
//       let dsApiClient = new docusign.ApiClient();
//       dsApiClient.setBasePath(process.env.BASE_PATH);
//       const results = await dsApiClient.requestJWTUserToken(
//           process.env.INTEGRATION_KEY,
//           process.env.USER_ID,
//           "signature",
//           fs.readFileSync(path.join(__dirname, "private.key")),
//           3600
//       );
//       console.log(results.body);
//       request.session.access_token = results.body.access_token;
//       request.session.expires_at = Date.now() + (results.body.expires_in - 60) * 1000;
//    }
// }

// app.get("/", async (request, response) => {
//    await checkToken(request);
//    response.sendFile(path.join(__dirname, "index.html"));
// });

// app.get("/success", (request, resposne) => {
//    resposne.send("Success");
// });

// // https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=(YOUR CLIENT ID)&redirect_uri=http://localhost:8000/

// app.listen(8000, () => {
//    console.log("server has started", process.env.USER_ID);
// });