'use strict';

const gm = require('gm').subClass({imageMagick: true});
const streamSplitter = require('stream-splitter');
const request = require('request');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const THUMB_WIDTH_MAX = 1000;
const THUMB_HEIGHT_MAX = 1000;
const OUTPUT_FORMAT = 'png';
const PNG_SPLITTER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];

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
    let bucketName = input.bucketName;
    let fileKey = input.fileKey;
    let presignedUrl = input.presignedUrl;
    let page = input.page;
    let allPages = input.allPages;
    let thumbWidth = input.thumbWidth;
    let thumbHeight = input.thumbHeight;
    let format = input.format;
    //log input
    logMessage(`starting to generate thumbnail for ${bucketName}/${fileKey}, ${(allPages ? 'all pages' : 'page '+page)}, width ${thumbWidth}, height ${thumbHeight}, in ratio`);
    
    //gm frame index is 0-started
    //generate key for thumbnail file
    let idx = fileKey.lastIndexOf('.');
    let ext = fileKey.substring(idx + 1).toLowerCase();
    let thumbKeyPrefix = `${fileKey.substring(0, idx)}_page-`;
    let thumbKeySurfix = `.${format}`;

    //if all pages, starts from page 1
    if (allPages) page = 1;
    let pageIdx = page - 1;
    let thumbKey = thumbKeyPrefix + page + thumbKeySurfix;

    //test if thumbnail exists
    let thumbGetParams = {
        Bucket: bucketName,
        Key: (allPages ? thumbKeyPrefix + '0' : thumbKey)
    };
    s3.headObject(thumbGetParams, function (err, metadata) { 
        if (err && err.code === 'NotFound') {  
            //log
            logMessage('generating thumbnail, result name ' + thumbKeyPrefix + (allPages ? 'X' : page) + thumbKeySurfix + (allPages ? ', all pages' : ''));

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

                //generate thumbnail on s3 response
                generateThumbnail(callback, response, bucketName, allPages, page, pageIdx, ext, thumbWidth, thumbHeight, format, thumbKeyPrefix, thumbKeySurfix);
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
            msg = `Thumbnail exists ${(allPages ? thumbKeyPrefix + '0' : thumbKey)}`;
            logMessage(msg);
            callback(null, successResponse(msg));
            return;
        }
    }); //s3 head
};

const generateThumbnail = (callback, response, bucketName, allPages, page, pageIdx, ext, thumbWidth, thumbHeight, format, thumbKeyPrefix, thumbKeySurfix) => {
    let msg = null;
    //load pdf with gm
    let image;
    let pageForSize;
    if (allPages){
        image = gm(response.Body);
        pageForSize = gm(response.Body).selectFrame(0);
        logMessage(`file extension - ${ext}, all pages`);
    }
    else{
        image = gm(response.Body).selectFrame(pageIdx);
        pageForSize = image;
        logMessage(`file extension - ${ext}, page ${page}`);
    }

    //get actual size
    pageForSize.size( (err, size) => {
        if(err) {
            msg = `gm get size`;
            logError(msg, err);
            callback(null, errorResponse(msg, err));
            return;
        }

        //get thumb dimensions
        let thumbDim = thumbnailDimensions(thumbWidth, thumbHeight, size.width, size.height);
        logMessage(`input dim: ${thumbWidth}x${thumbHeight}, page dim: ${size.width}x${size.height}, thumb dim: ${thumbDim.width}x${thumbDim.height}`);
        thumbWidth = thumbDim.width;
        thumbHeight = thumbDim.height;
        
        //generate thumbnail
        let splitBuffer = new Buffer(PNG_SPLITTER); //png headers
        let thumbStream = streamSplitter(splitBuffer);
        thumbStream.on('done', function() {
            msg = `successfully generated all thumbnails`;
            logMessage(msg);
            callback(null, successResponse(msg));
            return;
        });
        thumbStream.on('error', function(err) {
            msg = `stream splitter`;
            logError(msg, err);
            callback(null, errorResponse(msg, err));
            return;
        });
        let pageNumber = (allPages ? 1 : page);
        let counter = 0;
        thumbStream.on('token', (token) => {
            if (token.length > 0) {
                //logs
                if (counter === 0)
                    logMessage('gm process finished');

                //get thumb key
                let thumbKey = thumbKeyPrefix + pageNumber + '.' + format;
                
                //get thumb stream (png header + content)
                let thumb = Buffer.concat([splitBuffer,token]);

                //write thumbnail to s3
                //write page 0 (placeholder) if all pages, as a flag this is done before
                if (allPages && counter === 0){
                    let thumbPutParamsAllPages = {
                        Bucket: bucketName,
                        Key: thumbKeyPrefix + '0',
                        ContentType: 'text/plain',
                        Body: 'placeholder',
                        ContentLength: 11
                    };
                    s3.putObject(thumbPutParamsAllPages, (err, data) => {
                        if (err) {
                            msg = 'upload placeholder to s3';
                            logError(msg, err);
                            callback(null, errorResponse(msg, err));
                            return;
                        }
                        msg = `Successfully uploaded placeholder ${thumbKeyPrefix}0`;
                        logMessage(msg);
                    });
                }
                //write thumbnail for page X
                let thumbPutParams = {
                    Bucket: bucketName,
                    Key: thumbKey,
                    ContentType: `image/${format}`,
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
                    //log
                    msg = `Successfully uploaded thumbnail ${thumbKey}`;
                    logMessage(msg);
                }); //s3 put
                
                pageNumber++;
                counter++;
            }
        });
        image
            .setFormat(format)
            .filter('Cubic')
            .resize(thumbWidth, thumbHeight)
            .out('+adjoin') //if multi page
            .stream( /*(err, stdout, stderr) => {
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
                    logMessage('thumb total length' + thumb.length);
                }); //stdout
            }*/) //gm stream
            .pipe(thumbStream);
    }); //gm size
}

//input related functions
const getInputParam = (event) => {
    //'event.queryStringParameters', 'event.headers' 'event.pathParameters' 'event.body' 
    //'event.stageVariables' 'event.requestContext'
    //(typeof event.body === 'string' ? JSON.parse(event.body) : event)
    let bucketName = null;
    let fileKey = null;
    let presignedUrl = null;
    let page = null;
    let allPages = false;
    let thumbWidth = null;
    let thumbHeight = null;
    let format = null;
    //validate input query string parameter
    if (event.queryStringParameters !== null && event.queryStringParameters !== undefined) {
        if (event.queryStringParameters.bucket !== undefined && event.queryStringParameters.bucket !== null && event.queryStringParameters.bucket !== '') {
            bucketName = event.queryStringParameters.bucket;
        }
        if (event.queryStringParameters.file !== undefined && event.queryStringParameters.file !== null && event.queryStringParameters.file !== '') {
            fileKey = event.queryStringParameters.file;
        }
        if (event.queryStringParameters.presignedUrl !== undefined && event.queryStringParameters.presignedUrl !== null && event.queryStringParameters.presignedUrl !== '') {
            presignedUrl = event.queryStringParameters.presignedUrl;
        }
        if (event.queryStringParameters.page !== undefined && event.queryStringParameters.page !== null && event.queryStringParameters.page !== '') {
            page = event.queryStringParameters.page;
        }
        if (event.queryStringParameters.width !== undefined && event.queryStringParameters.width !== null && event.queryStringParameters.width !== '') {
            thumbWidth = event.queryStringParameters.width;
        }
        if (event.queryStringParameters.height !== undefined && event.queryStringParameters.height !== null && event.queryStringParameters.height !== '') {
            thumbHeight = event.queryStringParameters.height;
        }
        if (event.queryStringParameters.format !== undefined && event.queryStringParameters.format !== null && event.queryStringParameters.format !== '') {
            format = event.queryStringParameters.format;
        }
    }
    return {
        bucketName: bucketName,
        fileKey: fileKey,
        presignedUrl: presignedUrl,
        page: page,
        allPages: allPages,
        thumbWidth: thumbWidth,
        thumbHeight: thumbHeight,
        format: format
    };
}
const validateInputParam = (input) => {
    let msg = null;
    //validate input
    //bucket has to be specified, or presignedUrl
    if (input.bucketName === null && input.presignedUrl === null) {
        msg = 'invalid input parameter, "bucket" is required';
        return msg;
    }
    //file has to be specified, or presignedUrl
    if (input.fileKey === null && input.presignedUrl === null) {
        msg = 'invalid input parameter, "file" is required';
        return msg;
    }
    //file needs valid extension
    let file = null;
    if (input.presignedUrl !== null) {
        let idx1 = input.presignedUrl.indexOf('?');
        let idx2 = input.presignedUrl.indexOf('#');
        if (idx1 >= 0)
            file = input.presignedUrl.substring(0, idx1);
        else if (idx2 >= 0)
            file = input.presignedUrl.substring(0, idx2);
        else
            file = input.presignedUrl;
    }
    else if (input.fileKey !== null) {
        file = input.fileKey;
    }
    //invalid input file format
    if (file === null) {
        msg = `invalid file name, ${file}`;
        return msg;
    }
    //no extension
    let idx = file.lastIndexOf('.');
    if (idx === -1) {
        msg = `invalid file name, ${file}`;
        return msg;
    }
    //invalid extension
    let ext = file.substring(idx + 1).toLowerCase();
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

//thumbnail dimensions (in proportion of original page width and height)
const thumbnailDimensions = (inputWidth, inputHeight, pageWidth, pageHeight) => {
    let thumbWidth = null;
    let thumbHeight = null;
    if (pageWidth <= inputWidth && pageHeight <= inputHeight) {
        thumbWidth = pageWidth;
        thumbHeight = pageHeight;
    }
    else {
        let scalingFactor = Math.min(inputWidth/parseFloat(pageWidth), inputHeight/parseFloat(pageHeight));
        thumbWidth = Math.floor(pageWidth * scalingFactor);
        thumbHeight = Math.floor(pageHeight * scalingFactor);
    }
    return {
        width: thumbWidth,
        height: thumbHeight
    }
}

//logging
const logMessage = (msg) => {
    console.log(msg);
}
const logError = (msg, err) => {
    let errmsg = `Error, ${msg}`;
    if (err)
        errmsg += `, ${JSON.stringify({ message: err.message, stack: err.stack })}`;
    console.log(errmsg);
}

//response format
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
