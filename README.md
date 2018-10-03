# pdf-thumbnail #
lambda function to generate thumbnails for specifid page of a PDF file stored on S3 bucket

## input (querystring) ##
`bucket`: s3 bucket name, make sure the lambda function has access to bucket (not implemented yet, currently "nzfsg.co.nz.mycrm")  
`file`: full path to the file including folder/prefix and extension. **Required**  
`page`: page number to generate thumbnail. **Optional**, default value **1**

## output ##
`200`: `{message: ""}`  
`400`: `{message: "", err: {} }`  
`502`: `internal server error, view logs on cloudwatch`

## to test ##
https://dnkw5xa481.execute-api.ap-southeast-2.amazonaws.com/dev/thumbnail?file=FILE-PATH-HERE&page=PAGENUMBER
MyCRM/a-adfda-and-d-adfad_Credi_13-34-22-67672.pdf

## helpful resources ##
https://github.com/tchapi/markdown-cheatsheet/blob/master/README.md
https://stackoverflow.com/questions/51621169/convert-pdf-pages-into-images-using-aws-s3-and-lambda

## current problem ##
thumbnail is 0 size (check gm code)
