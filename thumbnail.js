'use strict';

const gm = require('gm').subClass({imageMagick: true});
const AWS = require('aws-sdk');
const THUMB_WIDTH_MAX = 800;
const THUMB_HEIGHT_MAX = 800;
const OUTPUT_FORMAT = 'png';

module.exports.handler = (event, context, callback) => {
    let msg = null;
    //get input parameters
    let input = getInputParam(event);
    //validate input (required params)
    msg = validateInputParam(input);
    if (msg !== null) {
        logError(msg);
        callback(null, errorResponse(msg));
        return;
    }
    //default params if not specified
    input = defaultInputParam(input);
    //assign values for later use
    let fileKey = input.fileKey;
    let page = input.page;
    let allPages = input.allPages;
    let bucketName = input.bucketName;
    let thumbWidth = input.thumbWidth;
    let thumbHeight = input.thumbHeight;
    let format = input.format;
    //log input
    logMessage(`starting to generate thumbnail for ${bucketName}/${fileKey}, page ${page}, width ${thumbWidth}, height ${thumbHeight}, in ratio`);
    
    //gm frame index is 0-started
    //generate key for thumbnail file
    let idx = fileKey.lastIndexOf('.');
    let ext = fileKey.substring(idx + 1).toLowerCase();
    let thumbKeyPrefix = `${fileKey.substring(0, idx)}_page-`;
    let thumbKeySurfix = `.${format}`;

    //*****temp code for page before allowing generation of all pages**********
    if (allPages) page = 1;
    let pageIdx = page - 1;
    let thumbKey = thumbKeyPrefix + page + thumbKeySurfix;
    //*************************************************************************

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
            logMessage(`generating thumbnail, result name ${thumbKey}`);

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
                logMessage(`s3 pdf response length ${response.Body.length}`);

                //initialise gm image
                let image = gm(response.Body).selectFrame(pageIdx).flatten();
                logMessage(`file extension - ${ext}, page ${page}, direct load to gm`);

                //get actual size
                image.size( (err, size) => {
                    if(err) {
                        msg = `gm get size`;
                        logError(msg, err);
                        callback(null, errorResponse(msg, err));
                        return;
                    }
                    logMessage(`pdf page size ${JSON.stringify(size)}`);
                    
                    //generate thumbnail
                    image
                        .setFormat('png')
                        //.resize(100, 100, '^')
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
                                //check thumbnail size
                                if (thumb.length == 0){
                                    msg = `gm conversion size 0`;
                                    logError(msg);
                                    callback(null, errorResponse(msg));
                                    return;
                                }
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
                        }); //gm stream
                }); //gm size
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

const getInputParam = (event) => {
    //'event.queryStringParameters', 'event.headers' 'event.pathParameters' 'event.body' 
    //'event.stageVariables' 'event.requestContext'
    //(typeof event.body === 'string' ? JSON.parse(event.body) : event)
    let fileKey = null;
    let page = null;
    let allPages = false;
    let bucketName = null;
    let thumbWidth = null;
    let thumbHeight = null;
    let format = null;
    //validate input query string parameter
    if (event.queryStringParameters !== null && event.queryStringParameters !== undefined) {
        if (event.queryStringParameters.bucket !== undefined && event.queryStringParameters.bucket !== null && event.queryStringParameters.bucket !== "") {
            bucketName = event.queryStringParameters.bucket;
        }
        if (event.queryStringParameters.file !== undefined && event.queryStringParameters.file !== null && event.queryStringParameters.file !== "") {
            fileKey = event.queryStringParameters.file;
        }
        if (event.queryStringParameters.page !== undefined && event.queryStringParameters.page !== null && event.queryStringParameters.page !== "") {
            page = event.queryStringParameters.page;
        }
        if (event.queryStringParameters.width !== undefined && event.queryStringParameters.width !== null && event.queryStringParameters.width !== "") {
            thumbWidth = event.queryStringParameters.width;
        }
        if (event.queryStringParameters.height !== undefined && event.queryStringParameters.height !== null && event.queryStringParameters.height !== "") {
            thumbHeight = event.queryStringParameters.height;
        }
        if (event.queryStringParameters.format !== undefined && event.queryStringParameters.format !== null && event.queryStringParameters.format !== "") {
            format = event.queryStringParameters.format;
        }
    }
    return {
        fileKey: fileKey,
        page: page,
        allPages: allPages,
        bucketName: bucketName,
        thumbWidth: thumbWidth,
        thumbHeight: thumbHeight,
        format: format
    };
}
const validateInputParam = (input) => {
    let msg = null;
    //validate input
    //bucket has to be specified
    if (input.bucketName === null) {
        msg = 'invalid input parameter, "bucket" is required';
        return msg;
    }
    //file has to be specified
    if (input.fileKey === null) {
        msg = 'invalid input parameter, "file" is required';
        return msg;
    }
    //file needs extension
    let idx = input.fileKey.lastIndexOf('.');
    if (idx === -1) {
        msg = `invalid file name, ${input.fileKey}`;
        return msg;
    }
    //valid extension
    let ext = input.fileKey.substring(idx + 1).toLowerCase();
    if (ext !== 'pdf' && ext !== 'tiff' && ext !== 'tif' && ext !== 'gif' && ext !== 'jpg' && ext !== 'png') {
        msg = `invalid file extension, .${ext}`;
        return msg;
    }
    return msg;
}
//this function mutates input object
const defaultInputParam = (input) => {
    //default to all pages if page not specified
    if (input.page === null || isNaN(input.page) || input.page < 1) {
        input.allPages = true;
        input.page = 0;
    }
    //default thumb width
    if (input.thumbWidth === null || isNaN(input.thumbWidth) || input.thumbWidth < 1 || input.thumbWidth > THUMB_WIDTH_MAX) {
        input.thumbWidth = THUMB_WIDTH_MAX;
    }
    //default thumb height
    if (input.thumbHeight === null || isNaN(input.thumbHeight) || input.thumbHeight < 1 || input.thumbHeight > THUMB_HEIGHT_MAX) {
        input.thumbHeight = THUMB_HEIGHT_MAX;
    }
    //default output format
    if (input.format === null || (input.format !== 'png' && input.format !== 'jpg')) {
        input.format = OUTPUT_FORMAT;
    }
    return input;
}
const logMessage = (msg) => {
    console.log(msg);
}
const logError = (msg, err) => {
    let errmsg = `Error, ${msg}`;
    if (err)
        errmsg += `, ${JSON.stringify({ message: err.message, stack: err.stack })}`;
    console.log(errmsg);
}
const responseTemplate = () => {
    return {
            statusCode: null,
            headers: {
                'Access-Control-Allow-Origin' : '*', // Required for CORS support to work
                'Access-Control-Allow-Credentials' : true, // Required for cookies, authorization headers with HTTPS 
            },
            body: null
        };
}
const errorResponse = (msg, err) => {
    let resbody = { message: msg };
    if (err)
        resbody.error = { message: err.message, stack: err.stack };
    let httpres = responseTemplate();
    httpres.statusCode = 400;
    httpres.body = JSON.stringify(resbody);
    return httpres;
}
const successResponse = (msg) => {
    let resbody = { message: msg };
    let httpres = responseTemplate();
    httpres.statusCode = 200;
    httpres.body = JSON.stringify(resbody);
    return httpres;
}
const guid = () => {
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

const s4 = () => {
  return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
}
