<<<<<<< HEAD
# Logging system
## Hướng dẫn deploy hệ thống
*   Cấu hình hệ thống trong config/default.js
```javascript
{
	"port": 3000,
	"numWebservers": 4,
	"limitSearch":40,
	"mongoDB":{
		"host": "127.0.0.1",
		"port": 1234,
		"username": "test",
		"password": "test",
		"database": "test",
		"collectionApps": "apps"
	},

	"rabbitMQ":{
		"host": "localhost",
		"port": 5672,
		"username": "guest",
		"password": "guest",
		"vitualHost": "",
		"numWorkers": 4,
		"taskQueue": "task",
		"logQueue": "logs",
		"exchange": "topics_log",
		"prefetch": 1,
		"portAPI": 15672
	}
}
```
* Note:
    * port: Cổng web server lắng nghe request
    * numWebservers: Số lượng các web server phục vụ request client
    * limitSearch: Số lượng log trả về từ  api tìm kiếm
    * mongoDB: Cấu hình cơ sở dữ liệu mongodb 
        * collectionApps: Tên collection lưu trữ dữ liệu các app của hệ thống
    * rabbitMQ: Cấu hình kết nối RabbitMQ
        * numWorkers: Số lượng worker sử lý lưu trữ log
        * taskQueue: Tên queue để lưu trữ các task liên quan đến quản lý worker
        * logQueue: Tên queue lưu trữ các dữ  liệu log
        * exchange: Tên exchange sử dụng để broker các message 
        * prefetch: Cấu hình số message 1 worker có thể giữ 
        * portAPI: port sử dụng các API của RabbitMQ

* Cài đặt Node.JS, RabbitMQ, MongoDB, cấu hình các thông tin phù hợp, các tham số như database, collectionApps, exchange, logQueue, taskQueue nên thiết lập lại để tránh trường hợp nó đã bị sử dụng

* Di chuyển vào thư mục chứa project từ command/terminal, chạy lệnh ***npm install*** để cài đặt các module cần thiết của project

* Chạy lệnh ***node webserver*** và ***node worker*** trên 2 terminal/command khác nhau để khởi động worker và webserver
* Để truy cập vào CMS  từ trình duyệt truy cập http://localhost:[port: port chạy web server cấu hình trong config]/CMS, Ví dụ: http://localhost:3000/CMS

## API lưu trữ log
    http://host:port/saveLog
* Giao thức POST
* Content-type: *application/json*
* Trường token của app là _token
* Nên có thêm trường **time: miliseconds** sử dụng để xóa dữ liệu log sau 1 khoảng thời gian nếu không có hệ thống sẽ tính thời gian xóa theo cấu hình trong CMS là từ thời điểm insert vào cơ sở dữ liệu
* Ví dụ: 
```javascript
{
"_token": "56d532db7ef32d950e51a74a",
"actiontype" : "purchase", 
"time" : 1455340625441, 
"username": "tuanhm"
"cid" : 8, 
"pid" : 918,
"amount" : 2,
"price" : 87
}
```

* Khi WebServer đã nhận được request thì giá trị trả về luôn là thành công {success:true}, client nên bắt các sự kiện lỗi liên quan tới  stream, connection ...

## API tìm kiếm log
    http://host:port/search
* Giao thức POST
* Content-type: *application/json*
* Ví dụ:
```javascript
{
	"_token": "56d654411cf3c0191b8b0d38",
	"startTime": 1456891425594,
	"endTime": 1456891425594,
	"username": "tuanhm",
	"actiontype": "purchase",
	"page": 1
}
```
* Tham số:
    * _token: token của app
    * startTime: thời điểm bắt đầu  (miliseconds)
    * endTime: thời điểm kết thúc (miliseconds)
    * startTime, endTime sẽ sử dụng để tìm kiếm trên trường  **time**
    * page: mỗi lần truy vấn sẽ trả về chỉ n log , n được cấu hình trong file config, muốn lấy các log tiếp theo thì sẽ tăng giá trị page lên
    * Các tham số khác tùy chọn
* Hạn chế hiện tại chỉ hỗ trợ  các phép toán so sánh bằng trên các trường của log
* Các log trả về được sắp xếp theo thứ tự time giảm dần
* Ví dụ: Với cấu trúc log như ví dụ trên nếu muốn tìm kiếm các log liên quan tới user có username là tuanhm, của app có _token là  56d532db7ef32d950e51a74a thì dữ liệu json gửi lên sẽ là
```javascript
{
    "_token": "56d532db7ef32d950e51a74a",
    "username": "tuanhm"
}
```
* Tìm kiếm các log từ 1/2/2016 (1454259600000 miliseconds) cho tới 1/3/2016 (1456765200000 miliseconds) của username là tuanhm, app có _token là 56d532db7ef32d950e51a74a, actiontype là purchase
```javascript
{
    "_token": "56d532db7ef32d950e51a74a",
    "username": "tuanhm",
    "actiontype": "purchase",
    "startTime": 1454259600000,
    "endTime": 1456765200000
}
```
* Hai câu truy vấn trên sẽ trả về n log  mới nhất , để lấy các log tiếp theo sẽ thêm tham số page vào, ví dụ câu truy vấn đầu tiên muốn lấy  thêm n log tiếp theo 
```javascript
{
    "_token": "56d532db7ef32d950e51a74a",
    "username": "tuanhm",
    "page": 2
}
```
* Khuôn dạng dữ liệu trả về {success: true, logs:  [...]} hoặc {success: false}

## Cấu hình hệ thống thứ 3 lắng nghe các log từ các app
* Các hệ thống thứ 3 muốn lắng nghe dữ liệu log từ 1 game app cụ thể  sẽ phải implement  rabbitmq
* Đầu tiên sẽ kết nối tới cùng rabbit mà hệ thống đang sử dụng 
* Tạo queue mới thiết lập **durable = true** để tránh bị mất log khi disconnect 
* Bind key = _token với queue vừa tạo, _token là token của app 
* Khi đó các log của các app có token trùng với key sẽ được đẩy vào queue vừa tạo, kể cả khi disconnect các queue vẫn tiếp tục nhận, lưu các log  lại, do đã thiết lập **durable= true**
* **Note**: Khi có 2 hệ  thống cùng muốn lắng nghe log  từ 1 app thì phải thiết lập tên các queue khác nhau.
=======
JSONC
=====
# Update to version 1.6.1

[![Build Status](https://travis-ci.org/tcorral/JSONC.png)](https://travis-ci.org/tcorral/JSONC)

[Changelog](https://raw.github.com/tcorral/JSONC/master/changelog.txt)

## Background

One of the problems you can have developing rich internet applications (RIA) using Javascript is the amount of data being transported to
and from the server.
When data comes from server, this data could be GZipped, but this is not possible when the big amount of data comes from
the browser to the server.

##### JSONC is born to change the way browser vendors think and become an standard when send information to the server efficiently. 


JSONC has two differents approaches to reduce the size of the amount of data to be transported:

* *JSONC.compress* - Compress JSON objects using a map to reduce the size of the keys in JSON objects.
    * Be careful with this method because it's really impressive if you use it with a JSON with a big amount of data, but it
could be awful if you use it to compress JSON objects with small amount of data because it could increase the final size.
    * The rate compression could variate from 7.5% to 32.81% depending of the type and values of data.
* *JSONC.pack* - Compress JSON objects using GZIP compression algorithm, to make the job JSONC uses a modification to
use the gzip library and it encodes the gzipped string with Base64 to avoid url encode.
   * Gzip - @beatgammit - https://github.com/beatgammit/gzip-js
   * Base64 - http://www.webtoolkit.info/
   * You can use pack to compress any JSON objects even if these objects are not been compressed using JSONC
See Usage for more details.

##Usage

####Compress a JSON object:

    // Returns a JSON object but compressed.
    var compressedJSON = JSONC.compress( json );

####Decompress a JSON object:

    // Returns the original JSON object.
    var json = JSONC.decompress( compressedJSON );

####Compress a normal JSON object as a Gzipped string:

    // Returns the LZW representation as string of the JSON object.
    var lzwString = JSONC.pack( json );

####Compress a JSON object as a Gzipped string after compress it using JSONC:

    // Returns the LZW representation as string of the JSON object.
    var lzwString = JSONC.pack( json, true );

####Decompress a normal JSON object from a Gzipped string:

    // Returns the original JSON object.
    var json = JSONC.unpack( gzippedString );

####Decompress a JSON compressed object using JSONC from a Gzipped string:

    // Returns the original JSON object.
    var json = JSONC.unpack( gzippedString, true );

## Examples of compression

####Example data.js.

    Original - 17331 bytes
    Compressed using JSONC - 16025 bytes
    Compression rate - 7.5%


    Original compressed using gzip.js - 5715 bytes
    Compressed using JSONC using gzip.js - 5761 bytes


    Compression rate from original to compressed using JSONC and gzip.js - 66.76%

####Example data2.js.

    Original - 19031 bytes
    Compressed using JSONC - 12787 bytes
    Compression rate - 32.81%


    Original compressed using gzip.js - 4279 bytes
    Compressed using JSONC using gzip.js - 4664 bytes


    Compression rate from original to compressed using JSONC and gzip.js - 75.49%

##Next steps
####Implement the gzip class in different languages (Java, Ruby...)
>>>>>>> 6a85200f9ed096941e7a873c6205903764d06e58
