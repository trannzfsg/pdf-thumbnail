'use strict';

const bucketName = process.env.bucketName;
const gm = require('gm');
const AWS = require('aws-sdk');

module.exports.main = function(event, context, callback) {
    let msg = null;
    //get input parameters
    //'event.queryStringParameters', 'event.headers' 'event.pathParameters' 'event.body' 
    //'event.stageVariables' 'event.requestContext'
    //(typeof event.body === 'string' ? JSON.parse(event.body) : event)
    let fileKey = null;
    let page = null;
    //validate input query string parameter
    if (event.queryStringParameters !== null && event.queryStringParameters !== undefined) {
        if (event.queryStringParameters.file !== undefined && event.queryStringParameters.file !== null && event.queryStringParameters.file !== "") {
            fileKey = event.queryStringParameters.file;
        }
        if (event.queryStringParameters.page !== undefined && event.queryStringParameters.page !== null && event.queryStringParameters.page !== "") {
            page = event.queryStringParameters.page;
        }
    }
    //default page to 1 if not specified
    if (page === null)
        page = 1;
    //validate input
    if (fileKey === null || isNaN(page) || page < 1) {
        msg = 'invalid input parameter, requires file and page';
        logError(msg);
        callback(null, errorResponse(msg));
        return;
    }
    logMessage(`starting to generate thumbnail for ${fileKey} page ${page}`);

    //gm frame index is 0-started
    let pageIdx = page;// - 1;

    //generate key for thumbnail file
    let idx = fileKey.lastIndexOf('.');
    if (idx === -1) {
        msg = `invalid file name, ${fileKey}`;
        logError(msg);
        callback(null, errorResponse(msg));
        return;
    }
    //valid extension
    let ext = fileKey.substring(idx + 1).toLowerCase();
    if (ext !== 'pdf' && ext !== 'tiff' && ext !== 'jpg' && ext !== 'png' && ext !== 'gif') {
        msg = `invalid file extension, .${ext}`;
        logError(msg);
        callback(null, errorResponse(msg));
        return;
    }
    //thumbnail is png
    let thumbKey = `${fileKey.substring(0, idx)}_page-${page}.png`;

    //s3 object
    let s3 = new AWS.S3();

    //test if thumbnail exists
    let thumbGetParams = {
        Bucket: bucketName,
        Key: thumbKey
    };
    s3.headObject(thumbGetParams, function (err, metadata) {  
        if (err && err.code === 'NotFound') {  
            //log
            logMessage(`generating thumbnail for ${fileKey}, result file ${thumbKey}`);

            //get file from s3
            let fileGetParams = {
                Bucket: bucketName,
                Key: fileKey
            };
            s3.getObject(fileGetParams, (err, response) => {
                if (err) {
                    msg = 'S3 get object';
                    logError(msg, err);
                    callback(null, errorResponse(msg, err));
                    return;
                }
                //generate thumbnail
                gm(response.Body)
                    //.selectFrame(pageIdx)
                    .setFormat('png')
                    .resize(100, 100, '^')
                    .stream( (err, stdout, stderr) => {
                        if(err) {
                            msg = `gm conversion`;
                            logError(msg, err);
                            callback(null, errorResponse(msg, err));
                            return;
                        }
                        //get thumbnail bytes
                        let chunks = [];
                        stdout.on('data', (chunk) => {
                            chunks.push(chunk);
                        });
                        stderr.on('data', (data) => {
                            msg = `gm write image ${data}`;
                            logError(msg);
                        });
                        stdout.on('end', () => {
                            logMessage('gm process finished');
                            let thumb = Buffer.concat(chunks);
                            //write thumbnail to s3
                            let thumbPutParams = {
                                Bucket: bucketName,
                                Key: thumbKey,
                                ContentType: 'image/png',
                                Body: thumb,
                                ContentLength: thumb.length
                            };
                            s3.putObject(thumbPutParams, (err, data) => {
                                if (err) {
                                    msg = 'upload thumbnail to s3';
                                    logError(msg, err);
                                    callback(null, errorResponse(msg, err));
                                    return;
                                }
                                //return success response
                                msg = `Successfully generated thumbnail ${thumbKey}`;
                                logMessage(msg);
                                callback(null, successResponse(msg));
                                return;
                            }); //s3 put
                        }); //stdout
                    }); //gm
            }); //s3 get
        } //if not found
        else if (err) {  
            msg = 'check thumbnail exists';
            logError(msg, err);
            callback(null, errorResponse(msg, err));
            return;
        }
        else {  
            //return success response
            msg = `Thumbnail exists ${thumbKey}`;
            logMessage(msg);
            callback(null, successResponse(msg));
            return;
        }
    }); //s3 head
};

const logMessage = function(msg) {
    console.log(msg);
}
const logError = function(msg, err) {
    let errmsg = `Error, ${msg}`;
    if (err)
        errmsg += `, ${JSON.stringify(err)}`;
    console.log(errmsg);
}
const responseTemplate = function () {
    return {
            statusCode: null,
            headers: {
                'Access-Control-Allow-Origin' : '*', // Required for CORS support to work
                'Access-Control-Allow-Credentials' : true, // Required for cookies, authorization headers with HTTPS 
            },
            body: null
        };
}
const errorResponse = function(msg, err) {
    let resbody = { message: msg };
    if (err)
        resbody.error = err;
    let httpres = responseTemplate();
    httpres.statusCode = 400;
    httpres.body = JSON.stringify(resbody);
    return httpres;
}
const successResponse = function(msg) {
    let resbody = { message: msg };
    let httpres = responseTemplate();
    httpres.statusCode = 200;
    httpres.body = JSON.stringify(resbody);
    return httpres;
}