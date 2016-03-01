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
* Content-type: *application/x-www-form-urlencoded*
* Key token của app là _token
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
    http://host:port/search?param=value&...
* Giao thức GET
* Tham số:
    * _token: token của app
    * startTime: thời điểm bắt  định dạng DD-MM-YYYY
    * endTime: thời điểm kết thúc định dạng DD-MM-YYYY
    * page: mỗi lần truy vấn sẽ trả về chỉ n log , n được cấu hình trong file config, muốn lấy các log tiếp theo thì sẽ tăng giá trị page lên
    * Các tham số khác tùy chọn
* Hạn chế hiện tại các key-value gửi lên tìm kiếm  value đều có dạng string nên các tìm kiếm chỉ khớp các gía trị trường có kiểu dữ liệu là string
* Các log trả về được sắp xếp theo thứ tự time giảm dần
* Ví dụ: Với cấu trúc log như ví dụ trên nếu muốn tìm kiếm các log liên quan tới user có username là tuanhm, của app có _token là  56d532db7ef32d950e51a74a thì câu truy vấn sẽ là:
```
http://host:port/search?_token=56d532db7ef32d950e51a74a&username=tuanhm
```
* Tìm kiếm các log từ đầu tháng 2/2016 cho tới đầu tháng 3/2016  của username là tuanhm, app có _token là 56d532db7ef32d950e51a74a, actiontype là purchase
```
http://host:port/search?_token=56d532db7ef32d950e51a74a&username=tuanhm&actiontype=purchase&startTime=1-2-2016&endTime=1-3-2016
```
* Hai câu truy vấn trên sẽ trả về n log  mới nhất , để lấy các log tiếp theo sẽ thêm tham số page vào, ví dụ câu truy vấn đầu tiên muốn lấy  thêm n log tiếp theo 
```
http://host:port/search?_token=56d532db7ef32d950e51a74a&username=tuanhm&page=2
```
* Khuôn dạng dữ liệu trả về {success: true, logs:  [...]} hoặc {success: false}

## Cấu hình hệ thống thứ 3 lắng nghe các log từ các app
* Các hệ thống thứ 3 muốn lắng nghe dữ liệu log từ 1 game app cụ thể  sẽ phải implement  rabbitmq
* Đầu tiên sẽ kết nối tới cùng rabbit mà hệ thống đang sử dụng 
* Tạo queue mới thiết lập **durable = true** để tránh bị mất log khi disconnect 
* Bind key = _token với queue vừa tạo, _token là token của app 
* Khi đó các log của các app có token trùng với key sẽ được đẩy vào queue vừa tạo, kể cả khi disconnect các queue vẫn tiếp tục nhận, lưu các log  lại, do đã thiết lập **durable= true**
* **Note**: Khi có 2 hệ  thống cùng muốn lắng nghe log  từ 1 app thì phải thiết lập tên các queue khác nhau.