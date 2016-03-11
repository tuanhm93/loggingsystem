# Logging system
## Hướng dẫn deploy hệ thống
*   Cấu hình hệ thống trong config/default.js
```javascript
{
    "port": 3000,
    "numWebservers": 4,
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

* Chạy lệnh ***node master-webserver*** và ***node master-worker*** trên 2 terminal/command khác nhau để khởi động worker và webserver
* Để truy cập vào CMS  từ trình duyệt truy cập http://localhost:[port: port chạy web server cấu hình trong config]/CMS, Ví dụ: http://localhost:3000/CMS

## API lưu trữ log
    http://host:port/api/save
* Giao thức POST
* Content-type: *application/json*
* Trường token của app là _token
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

* Khi WebServer đã nhận được request thì giá trị trả về luôn là thành công {success:true}
* Có 1 trường đặc biệt là **contents** đối với trường này nếu dữ liệu gửi lên là string hệ thống sẽ sử dụng gzip để nén dữ liệu trường này lại, nên rất phù hợp cho việc lưu trữ các chuỗi content dài mà không sợ quá tốn bộ nhớ, khi truy vấn lại các log trình sẽ tự động giải nén dữ liệu và trả về. Ví dụ: 
```javascript
"username" : "anhquanxx",
"contents" : "22:23:42: Logged in via R1001 platform: android version:v1.2.02 | vCode : 19 | 23/7/2014 money:10067 exp:520\n22:25:21: At b 7 r 17 chinese chess play game: 1380615_1446305121664_289\n22:40:56: receive: 1900. now, money: 11967 exp: 524\n22:41:12: At b 7 r 17 chinese chess play game: 1380615_1446306072683_290\n22:59:41: receive: -2000. now, money: 9967 exp: 524\n23:00:19: be kicked\n23:01:13: At b 44 r 11 chinese chess play game: 1379116_1446307273838_249\n23:16:33: receive: -8000. now, money: 1967 exp: 524\n23:17:36: charged 1000 gold\n23:18:05: At b 11 r 19 chinese chess play game: 1381131_1446308285452_175\n23:23:43: get online bonus: 110\n23:40:12: receive: -1000. now, money: 2077 exp: 524\n23:40:24: At b 11 r 19 chinese chess play game: 1381131_1446309624211_176\n23:59:20: receive: -1000. now, money: 1077 exp: 524\n23:59:30: log out"
```
*   Khi lưu trữ bình thường dữ liệu có cấu trúc như trên ở mongodb phiên bản 3.2.1 storage engine là wiredtiger sử dụng thư viện nén mặc định snappy thì sẽ tốn  915 bytes, trong khi sử dụng nén gzip ở trường content thì chỉ mất  463 bytes, giảm 1 nửa so với kích thước ban đầu
## API tìm kiếm log
    http://host:port/api/search
* Giao thức POST
* Content-type: *application/json*
* Hiện tại chương trình hỗ trỡ tìm kiếm so sánh bằng hoặc trong 1 khoảng của các trường
* Chủ động giới hạn số bản ghi trả về, số bản ghi skip (bỏ qua) dựa trên tham số gửi lên
* Sắp xếp bản ghi trả về theo giá trị trường gửi lên tham số
* Ví dụ:
```javascript
{
    "_token": "56d654411cf3c0191b8b0d38",
    "$s_time": 1456891425594,
    "$e_time": 1456891425594,
    "username": "tuanhm",
    "actiontype": "purchase",
    "sort": {
        "time": 1
    },
    "limit": 10,
    "page": 1
}
```
* Tham số:
    * _token: token của app
    * $s_time: giá trị min của trường **time**
    * $e_time: giá trị max của trường **time**
    * ("username": "tuanhm") tìm các log có trường username có giá trị là tuanhm
    * ("sort": {"time": 1}) sắp xếp các log theo giá trị trường time giảm dần
    * limit: số log trả về
    * page: mỗi lần truy vấn sẽ trả về chỉ  **limit** log, muốn lấy các log tiếp theo thì sẽ tăng giá trị page lên

* Ví dụ: Với cấu trúc log như ví dụ trên nếu muốn tìm kiếm các log **purchase** liên quan tới user có username là tuanhm, có giá trị price >= 50, lấy 20 log bỏ quả 20 log đầu tiên, sắp xếp theo  **price** giảm dần  của app có _token là  56d532db7ef32d950e51a74a thì dữ liệu json gửi lên sẽ là
```javascript
{
    "_token": "56d532db7ef32d950e51a74a",
    "actiontype": "purchase",
    "username": "tuanhm",
    "$s_price": 50,
    "limit": 20,
    "page": 1
    "sort": {
        "price": 1
    }
}
```

