# Logging system
## Overview
*   Log là một thành phần không thể thiếu của bất kỳ game, app nào 
*   Đa phần hiện nay các game, app thường tự quản lý  log của riêng mình  => mỗi khi xây dựng một game, app mới đều phải xây dựng thành phần quản lý log từ tổ chức lưu trữ đến khai thác tìm kiếm thông tin. Việc này sẽ dẫn tới một vài vấn đề:
    *    Phức tạp hóa việc phát triển  game, app  do luôn  phải làm thêm thành phần này 
    *    Do cách thức quản lý lưu trữ, khai thác nội dung trên mỗi game, app là khác nhau phụ thuộc vào người phát triển nên gặp khá nhiều khó khăn khi muốn truy cập, khai thác nội dung từ các game, app khác nhau
*   Mà đối với game, app cấu trúc chung về  log thường khá giống nhau 
*   Liệu có thể xây dựng một hệ thống quản lý log chung cho các game, app?

=> Đề xuất xây dựng một hệ thống giúp quản lý log của các ứng dụng, game

## Mô tả chung về hệ thống
*   Hệ thống cho phép các game, app lưu trữ log sinh ra trong quá trình hoạt động 
*   Các game, app có thể truy cập nội dung đã lưu trữ  trên hệ thống 
*   Mục đích của hệ thống
    * Giúp đơn giản hóa quá trình phát triển game, app do đã có hệ thống hỗ trợ việc quản lý lưu trữ, truy cập thông tin log => game, app chỉ focus vào logic nghiệp vụ của riêng mình
    * Dễ dàng khai thác nội dung từ các game, app khác nhau
    
## Các chức năng chính của hệ thống
* Tổ chức lưu trữ log  của các game, app khác nhau
* Cho phép truy cập, tìm kiếm nội dung đã lưu trữ của game, app trên hệ thống
* Do các log của game, app chỉ cần lưu trữ trong một khoảng thời gian nhất định vì thế  hệ thống cho phép cấu hình thời gian lưu trữ  log của  từng game, app cụ thể

## Các yêu cầu, hướng giải quyết đối với hệ thống

### Tương tác dễ dàng đối với hệ thống
* Cách thức để tương tác với hệ thống là qua giao thức http
* Http là một giao thức khá dễ dàng để implement 
* Hệ thống sẽ cung cấp các api  về lưu trữ, truy cập tìm kiếm thông tin   cho phía client (game, app) sử dụng 
* Hệ thống có CMS giúp tạo mới, quản lý các  game, app đang sử dụng hệ thống cũng như để cấu hình các thông tin phù hợp với từng game, app cụ thể

### Lưu trữ dữ liệu
* Có hai cách chính để lưu log thường thấy là lưu trữ dưới dạng file text hoặc lưu vào database
* Lưu trữ dưới dạng file text có lợi điểm đó là có thể nhìn thấy nội dung của nó, tuy nhiên lại gặp khó khăn trong việc khai thác, phân tích thông tin
* Do số lượng log đến từ các game app là rất  lớn  chính vì thế sẽ rất tốn không gian bộ nhớ lưu trữ, phải nghĩ tới phương án nén dữ liệu
* Nếu lưu dưới dạng file text sẽ gặp khó khăn trong việc nén dữ liệu, vì dữ liệu đến liên tục, thứ hai là khi muốn đọc lại mất công giải nén. Khá rườm rà
* Với database lại khác tuy không dễ dàng nhìn thấy nội dung trực tiếp nhưng dữ liệu lại được tổ chức có cấu trúc thuận lợi cho việc khai thác, phân tích thông tin. 
* Mỗi database có cách lưu trữ thông tin riêng của nó, bên cạnh đó hiện nay nó đã hỗ trợ nén dữ liệu, rất tiện dụng vì mình không cần quan tâm tới việc nén dữ liệu hay giải nén, database sẽ chịu trách nhiệm các công việc đó
* Hệ thống lưu trữ dữ liệu log trong mongodb , có nén dữ liệu, so sánh thực tế lưu trữ  dữ liệu nén và không nén được kết quả sau:
    * Bộ dữ liệu test bao gồm 2.000.000 bản ghi log  có cấu trúc
    ```
    { 
        "_id" : ObjectId("56a833e73a1a1d1c15b47be3"), 
        "username" : "tuanhm", 
        "time" : 1.453863911191E12, 
        "data" : "move a b"
    }
    ```
    * MongoDB kể từ v3.0 hỗ trợ storage engine  có chế độ nén dữ liệu, thử nghiệm được thực hiện dựa trên 1 storageEngine được sử dụng từ trước v3.0 là mmapv1, và một storage engine từ v3.0 hỗ trợ nén dữ liệu là wired tiger:
      * 300MB, 3152MB, 0 bản ghi
      * 357MB, 3616MB, 2.000.000 bản ghi
      * => lưu có nén mất 57MB trong khi lưu không nén mất 464MB
      * => tuy nhiên bộ dữ liệu test khác nhau có thể dẫn đến kết quả khác nhau
      * => cũng đã có rất nhiều các thử nghiệm tương tự trên mạng cho kết quả khá tốt  về sử dụng nén dữ liệu, dưới đây là một vài kết quả thực nghiệm  lấy từ cộng đồng mạng
![Thử nghiệm với dữ liệu chuyến bay](http://4.bp.blogspot.com/-vCqIGlS1Ar4/VNkC2IeMsJI/AAAAAAAAB78/7E-Ulo6b_WM/s1600/se-shootout-02-adamc-compression-size.png)
      * Thử nghiệm tương tự trên với bộ dữ liệu khác
      ![Thử nghiệm với dữ liệu chuyến bay](http://1.bp.blogspot.com/-AP6ez18phq0/VNkFtBph-9I/AAAAAAAAB8U/51I0Xn3pDqs/s1600/se-shootout-02-andyp-compression-size.png)
      * Như trên biểu đồ cho thấy ngay cách tổ chức lưu trữ dữ liệu của các engine cũng ảnh hưởng tới dung lượng dữ liệu khi chưa cần nén
      * **Note**: Đối với riêng wired tiger cũng sẽ có các tùy chọn nén khác nhau, mặc định mongodb sẽ sử dụng Snappy
* Từ kết quả  thực nghiệm trên, cũng như tham khảo thêm một vài thử nghiệm tương tự của cộng đồng mạng thì có thể thấy rằng giải pháp sử dụng nén của mongodb đi kèm khá tốt, có một vài storage engine bên ngoài cho kết quả tốt hơn như tokumx, tokumxse, rocksdb nhưng thường phiên bản mongodb kèm theo thường là bản cũ cụ thể tokumx chỉ hỗ trợ mongodb v2.4 là cao nhất hiện nay, và cũng khó đảm bảo tính ổn định của nó trong thực tế, thứ hai là các tính năng, hiệu năng cải thiện ở phiên bản mới cũng không được áp dụng
* Mặc dù nén dữ liệu như trên tuy nhiên hiệu năng đọc ghi của nó vẫn rất tốt, dưới đây là hình ảnh về kết quả thử nghiệm về khả năng ghi dữ liệu của wiredtiger so với mmapv1 và một storage engine Tokumxse tham khảo trên cộng đồng mạng
![Thử nghiệm với dữ liệu chuyến bay](http://1.bp.blogspot.com/-37s7efPfxVs/VNn_WRixrxI/AAAAAAAAB8s/lYij_8g_gLs/s1600/se-shootout-02-adamc-compression-speed.png)

## Hiệu năng hệ thống
* Do số lượng log được gửi lên server là khá cáo do đó hệ thống phải đảm bảo phản hồi xác nhận kịp thời về cho phía client, tiếp theo đó là do theo thời gian lượng client sử dụng hệ thống càng tăng dẫn đến hệ thống phải đảm bảo trong tương lai có thể phục vụ được một số lượng client đủ lớn
* Hệ thống được xây dựng trên nền tảng Node.js, lưu trữ dữ liệu trong cơ sở dữ liệu mongodb, và một woker chịu trách nhiệm ghi log vào cơ sở dữ liệu sử dụgn redis database để lưu dữ liệu tạm thời
* Luồng làm việc thì khi làm việc với hệ thống, client sẽ phải đăng ký một app với hệ thống, khi đó hệ thống sẽ gửi về một _token được sử dụng để phân biệt các app, mỗi lần muốn lưu log vào hệ thống, client sẽ phải gửi kèm theo _token nếu _token không hợp lệ thì sẽ báo lỗi
![Thử nghiệm với dữ liệu chuyến bay](images/6.png)
* Để đảm bảo có thể phục vụ được số lượng request lớn, chương trình có sử dụng nhiều tiến trình con cùng phục vụ đồng thời các request của phía client gửi lên. Số tiến trình này sẽ bằng số core của CPU trên máy chủ chương trình đang chạy
* Mỗi khi nhận được req ghi log từ phía client, hệ thống check xem _token  có hợp lệ hay không, nếu hợp lệ thì chương trình sẽ chuyển dữ liệu cần lưu tới woker chịu trách nhiệm ghi log vào cơ sở dữ liệu
![Thử nghiệm với dữ liệu chuyến bay](images/111.png)
* Woker chịu trách nhiệm ghi xuống cơ sở dữ liệu cũng sử dụng nhiều tiến trình con nhằm tối ưu tốc độ ghi xuống cơ sở dữ liệu. Các woker sẽ lấy các log được gửi tới trong một hàng đợi (queue) và ghi vào cơ sở dữ liệu, nếu xảy ra lỗi trong quá trình ghi thì log đó sẽ được đưa lại hàng đợi  và thực hiện ghi lại
![Thử nghiệm với dữ liệu chuyến bay](images/2222.png)
* Thử nghiệm với bộ dữ liệu:
```
 {
    "_id" : ObjectId("556b3e1065741c06e09df655"),
    "username" : "hungphong99",
    "contents" : "23:02:02:_Logged_in_via_Lumia_710_platform:_windowsphone_version:1.2.03.0_29_07_2014_money:36879_exp:823\n23:02:45:_At_b_4_r_10_caro_play_game:_1313284_1433088165608_1491\n23:04:24:_receive:_-300._now,_money:_36579_exp:_823\n23:04:35:_At_b_4_r_10_caro_play_game:_1313284_1433088275219_1492\n23:09:17:_receive:_-300._now,_money:_36279_exp:_823\n23:09:54:_At_b_4_r_10_caro_play_game:_1313284_1433088594458_1493\n23:13:35:_receive:_-300._now,_money:_35979_exp:_823\n23:13:43:_At_b_4_r_10_caro_play_game:_1313284_1433088823332_1494\n23:15:17:_receive:_-300._now,_money:_35679_exp:_823\n23:15:23:_At_b_4_r_10_caro_play_game:_1313284_1433088923174_1495\n23:18:42:_receive:_-300._now,_money:_35379_exp:_823\n23:18:50:_At_b_4_r_10_caro_play_game:_1313284_1433089130237_1496\n23:22:01:_receive:_-300._now,_money:_35079_exp:_823\n23:22:26:_At_b_4_r_10_caro_play_game:_1313284_1433089346872_1497\n23:27:12:_receive:_285._now,_money:_35364_exp:_824\n23:27:18:_At_b_4_r_10_caro_play_game:_1313284_1433089638680_1498\n23:27:44:_receive:_-300._now,_money:_35064_exp:_824\n23:27:48:_At_b_4_r_10_caro_play_game:_1313284_1433089668806_1499\n23:29:47:_receive:_285._now,_money:_35349_exp:_825\n23:33:15:_At_b_6_r_10_western_chess_play_game:_1640966_1433089995886_391\n23:41:45:_receive:_-300._now,_money:_35049_exp:_825\n23:41:59:_At_b_6_r_10_western_chess_play_game:_1640966_1433090519616_392\n23:59:17:_receive:_285._now,_money:_35334_exp:_829\n23:59:48:_log_out",   
}
```
* Thử nghiệm được thực hiện dựa trên việc gửi 10k request tới server, với 5 luồng liên tục thì kết quả cho thấy hệ thống có thể phục vụ khoảng 5k req/s
![Thử nghiệm với dữ liệu chuyến bay](images/9.png)
* THử nghiệm tương tự nhưng gửi 50k request đến server, kết quả hệ thống tương tự trường hợp trên tức 5k req/s
![Thử nghiệm với dữ liệu chuyến bay](images/333.png)

## Worker xử lý ghi log xuống cơ sở dữ liệu
* Các yêu cầu lưu trữ log từ phía client gửi đến server sẽ được chuyển tới một worker làm nhiệm vụ lưu trữ dữ liệu log xuống cơ sở dữ liệu (mongodb)
* Hệ thống sử dụng module của node js là [kue](https://github.com/Automattic/kue) để xây dựng worker
* [Kue](https://github.com/Automattic/kue) sử dụng redis database làm nơi lưu trữ dữ liệu công việc (các log cần lưu trữ)
* Như vậy thì service phục vụ các request ghi log từ client sẽ có kết nối tới redis database dùng chung này. Khi có log gửi tới nó chỉ đơn giản là gửi dữ liệu log này tới redis database và worker thì chỉ việc lấy dữ liệu và xử lý
* Đoạn mã cho việc xử lý yêu cầu lưu trữ log vào hệ thống:
![Thử nghiệm với dữ liệu chuyến bay](images/savelog.png)
![Thử nghiệm với dữ liệu chuyến bay](images/sendlogtoqueue.png)
* Ta thấy rằng hệ thống chỉ đơn giản là kiểm tra **_token** (một định danh để xác định app, game trong hệ thống), nếu **_token** hợp lệ thì dữ liệu được gửi lên sẽ được chuyển vào redis database qua hàm **sendLogToQueue(req.query, 0)** 
* **sendLogToQueue(req.query, 0)** sử dụng hàm xây dựng sẵn của module [kue](https://github.com/Automattic/kue) để tạo ra 1 công việc (log cần lưu trữ) rồi gửi vào database redis
* Tuy nhiên ở đây sẽ tiềm tàng lỗi đó là nếu kết nối tới redis database gặp vấn đề, hoặc có kết nối nhưng gặp một vấn đề gì đó dẫn tới việc gửi dữ liệu xuống redis không thành công
	* Trường hợp kết nối tới redis gặp vấn đề, rất may là driver redis đã xử lý vấn đề này bằng cách sẽ reconnect liên tục trong vòng 1h (đây là mặc định). Và toàn bộ các câu lệnh thực thi sẽ được driver này lưu trữ và thực thi ngay khi kết nối lại thành công. Hệ thống đã thử nghiệm với một log dữ liệu như trên thì lưu trữ được khoảng 200.000 request log, giả sử 1s hệ thống nhận 100 req log thì sẽ có thể lưu trữ trong khoảng 30 phút. Tuy nhiên việc lưu trữ lại nhiều là không tốt tại khi có kết nối lại thì nó sẽ thực thi luôn rất hao tốn tài nguyên CPU, RAM. Chính vì thế ngay khi có lỗi xảy ra với kết nối redis hệ thống sẽ có thông báo tới người quản trị qua email để khắc phục ngay nhằm tránh rủi ro về mất mát log
	* Trường hợp có kết nối nhưng vì một lý do gì đó log đã không được gửi thành công tới redis: Khi có lỗi như vậy xảy ra hệ thống sẽ thực hiện lại việc gửi log này tới redis 4 lần, mỗi phút một lần, nếu thất bại tất thì log sẽ được lưu trữ ra file, tuy nhiên trường hợp lỗi kiểu này rất ít khi xảy ra
* Về phía worker khi bị mất kết nối tới redis cũng sẽ reconnect lại cho đến khi thành công trong vòng 1 tiếng
* Hàm xử lưu trữ log phía worker:
![Thử nghiệm với dữ liệu chuyến bay](images/saveLogWorker.png)
* Sau khi lấy dữ liệu log và qua một vài thao tác tiền xử lý sẽ đẩy log vào đúng app, game cần lưu
* 1 công việc trong [kue](https://github.com/Automattic/kue) sẽ có 3 trạng thái cần quan tâm đó là: 
	* active: log đang được xử lý
	* inactive: log đã sẵn sàng để được xử lý
	* failed: log đã được xử lý và thất bại (không lưu được vào cơ sở dữ liệu)
* Khi log được xử lý thành công thì hệ thống sẽ xóa luôn khỏi redis
* Khi log xử lý thất bại thì sẽ có một hàm cứ sau 1 phút sẽ chạy một lần nhằm check các log xử lý bị thất bại và đưa lại vào trạng thái inactive để được xử lý lại: 
![Thử nghiệm với dữ liệu chuyến bay](images/fixjob.png)

* Việc sử dụng 1 cơ sở dữ liệu làm cầu nối trung gian giữa worker và web service sẽ có điểm khá hay đó là dù có tắt worker đi thì dữ liệu log cũng sẽ không bị mất do đã được lưu trữ ở redis
* Trường hợp mongodb bị shutdown thì về mặt web service 1 vài API sẽ k sử dụng được và sẽ có thông báo về cho client, tuy nhiên API cho việc lưu trữ log vấn hoạt động, mặc định driver mongodb cũng sẽ tự động reconnect lại
* Đối với worker thì các job sẽ đều failed và sẽ được đẩy lại trạng thái inactive mỗi 1 phút tuy nhiên cũng cần phải khắc phục sớm để tránh dữ liệu công việc lưu trữ tại redis là quá lớn









 
