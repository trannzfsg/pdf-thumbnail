# pdf-thumbnail #
lambda function to generate thumbnails for specifid page of a PDF file stored on S3 bucket

## input (querystring) ##
`bucket`: s3 bucket name. **Required**, make sure the lambda function has access to bucket  
`file`: full path to the file including folder/prefix and extension. **Required**  
`page`: page number to generate thumbnail. **Optional**, if not specified, will generate all pages  
`width`: (max) width of thumbnail. **Optional**, if not specified, max width will be 800px. Note resize width and height are always in ratio, with specified width as max width and specified height as max height. If specified width/height is greater than original, original width/height will be used  
`height`: (max) height of thumbnail. **Optional**, if not specified, max height will be 800px, see above for additional notes  
`format`: output image format. **Optional**, default value 'png'. Only accept 'png' and 'jpg'

## output ##
`200`: `{message: ''}`  
`400`: `{message: '', err: {message:'',stack:''} }`  
`502`: `internal server error, view logs on cloudwatch`  
Output thumbnail image will be stored in same folder of input file, with '\_page-{page}' added before file extension

## to test ##
https://dnkw5xa481.execute-api.ap-southeast-2.amazonaws.com/dev/thumbnail?bucket=nzfsg.co.nz.mycrm&file=MyCRM/a-adfda-and-d-adfad_Credi_13-34-22-67672.pdf

## helpful resources ##
readme format: https://github.com/tchapi/markdown-cheatsheet/blob/master/README.md
gm lib: https://github.com/aheckmann/gm/blob/e715cbdaacad21504fc04f6933be5cae1812501e/lib/command.js
sample code: https://stackoverflow.com/questions/51621169/convert-pdf-pages-into-images-using-aws-s3-and-lambda
multi-pages thumbnail: https://www.experts-exchange.com/articles/23019/Convert-a-multi-page-PDF-file-into-multiple-image-files.html

## current problem ##
thumbnail is 0 size (check gm code)
