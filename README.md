# pdf-thumbnail #
lambda function to generate thumbnails for specifid page of a PDF file stored on S3 bucket  

## input (querystring) ##
`bucket`: s3 bucket name, make sure the lambda function has read/write access to bucket, used together with `file`. **Required** if `presignedUrl` is not specified, response will be JSON with thumbnail generated in the bucket  
`file`: full path to the file including folder/prefix and extension, used together with `bucket`. **Required** if `presignedUrl` is not specified, response will be JSON with thumbnail generated in the bucket  
`presignedUrl`: presigned url or public url of the file, has to be publicly accessible, **Required** if `bucket` or `file` is not specified, response will be thumbnail byte array  
`page`: page number to generate thumbnail. **Optional**, if not specified, will generate all pages  
`width`: (max) width of thumbnail. **Optional**, if not specified, max width is 1000px. Note resize width and height are always in ratio, with specified width as max width and specified height as max height. If specified width/height is greater than original, original width/height will be used  
`height`: (max) height of thumbnail. **Optional**, if not specified, max height is 1000px, see above for additional notes  
`format`: output image format. **Optional**, default value 'png'. Only accept 'png' at the moment  

## output ##
**IF bucket and file are used**  
`200`: `{message: ''}`  
Output thumbnail image will be stored in same folder of input file, with `\_page-{page}` added before file extension. If page is not specified, will generate thumbnail for all pages, at the same time a place holder with `\_page-0` added at the end, and no file extension.  

**IF presignedUrl is used, without bucket**  
`200`: `{message: '', data: {number: 1, thumbBase64: []} }`  
**Note** the thumbnail byte array are base 64 encoded, decode it to get original byte array. 

For example, PNG headers always include [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]   
*Pseudo code*  
`var spliter = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];
var thumbnails = response.split(spliter);
foreach thumbnail in thumbnails
	thumbnail = spliter + thumbnail;
	display thumbnail`

**REGARDLESS OF INPUT**
`400`: `{message: '', err: {message:'',stack:''} }`  
`502`: `internal server error, view logs on cloudwatch`  

## to deploy ##
full deploy: `sls deploy -v`  
quick deploy: `sls deploy function -f thumbnail`  
watch logs through console: `sls logs -f thumbnail -t`  

## helpful resources ##
readme format: https://github.com/tchapi/markdown-cheatsheet/blob/master/README.md  
gm: http://www.graphicsmagick.org/GraphicsMagick.html  
gm nodejs lib: http://aheckmann.github.io/gm/docs.html  
sample code: https://stackoverflow.com/questions/51621169/convert-pdf-pages-into-images-using-aws-s3-and-lambda  
improve gm performance: https://medium.com/@dchesterton/improving-graphicsmagick-and-imagemagick-performance-406ff82e6191  

## to test ##
https://dnkw5xa481.execute-api.ap-southeast-2.amazonaws.com/dev/thumbnail?bucket=dev-mycrm-thumbnail&file=1.pdf&width=500&page=2  
https://dnkw5xa481.execute-api.ap-southeast-2.amazonaws.com/dev/thumbnail?presignedUrl={url}

## to do ##
use presigned url to download document (need to return thumbnails images as bytes)  
https://stackoverflow.com/questions/24598800/get-image-dimensions-from-url-path  
test other source file formats (png jpg tiff)  
allow other format of thumbnail output (jpg, different splitter)  
grant access to environment specific buckets (maybe grant access to all buckets in account?)  
enable other environments (sit/uat/prod)  
refactor code  
run/test locally (https://serverless.com/blog/quick-tips-for-faster-serverless-development/)  
cache results (redis memcached)  
unit testing  
