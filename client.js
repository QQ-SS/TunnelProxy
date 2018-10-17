'use strict';

// 客户端调用参数
// node client.js -h localhost -p 8080 -t localhost:3389 -l 3399
//

var host = 'localhost'; //隧道服务器默认的IP或者域名
var port = 8080; //隧道服务器默认监听端口
var lport = 3399; //本地监听端口
var toHost = '{"port":3389, "host":"localhost"}';
const cmd = 'AT+'; //指令前缀，可自行修改成其它
const compress = false; //是否启用压缩

//命令行支持
{
    var argvparser = function () {
        var args = require('arguments');
        args.parse(
            [
                { name: /^(-h|-host)$/, expected: /.+/, callback: setHost },
                { name: /^(-p|-port)$/, expected: /\d+/, callback: setPort },
                { name: /^(-t|-to)$/, expected: /.+:\d+/, callback: setToHost },
                { name: /^(-l|-lport)$/, expected: /\d+/, callback: setlPort }
            ],
            main,
            null
        );

        function setHost(end, val) {
            host = val;
            end();
        }
        function setPort(end, val) {
            port = parseInt(val);
            end();
        }
        function setToHost(end, val) {
            var util = require('util');
            let pa = /(.+):(\d+)/g.exec(val);
            if (pa) {
                toHost = util.format('{"host":"%s","port":%d, "compress": %s}', pa[1], pa[2], compress ? 'true' : 'false');
            }
            console.log(toHost);
            end();
        }
        function setlPort(end, val) {
            lport = parseInt(val);
            end();
        }
    };
    argvparser();
}

//控制台日志
var Log = function () {
    var dateFormat = require('dateformat');
    var util = require('util');
    var now = dateFormat(new Date(), '[yyyy-mm-dd HH:MM:ss]');
    console.log(now + ' ' + util.format.apply(this, arguments));
};

//主入口
function main() {
    var net = require('net');
    var zlib = require('zlib');
    var util = require('util');
    function connect() {
        var listenerClient = null;
        var client = net.connect(
            port,
            host,
            function () {
                Log('隧道服务端：%s:%d 连接成功', host, port);
                //client.setEncoding('binary');
                client.write(cmd + 'LOGIN:NATCLIENT', 'utf8');
            }
        );
        //client.on('connect', function () {
        //});

        client.on('error', function (err) {
            Log('隧道服务端：%s:%d 连接失败，正在重试', host, port);
            setTimeout(connect, 5000);
        });
        client.on('close', function () {
            if (listenerClient) listenerClient.close();
            Log('隧道服务端：%s:%d 连接已关闭', host, port);
        });

        client.on('data', function (buf) {
            if (listenerClient === null) {
                var data = buf.toString('utf8');

                if (data.startsWith(cmd)) {
                    console.log('recv data:' + data);

                    //登陆成功，请求连接
                    if (data === cmd + 'LOGIN:OK') {
                        let to = cmd + 'CONNECT:' + toHost;
                        Log(to);

                        client.write(
                            to,
                            'utf8'
                        );
                        return;
                    }

                    if (data.startsWith(cmd + 'CONNECT:')) {
                        //请求成功，开始本地监听
                        if (data === cmd + 'CONNECT:OK') {
                            //创建监听供代理远程桌面连接
                            listenerClient = net
                                .createServer(function (c) {
                                    //c.setEncoding('binary');

                                    if (compress) {
                                        c
                                            .pipe(zlib.createDeflateRaw({ flush: zlib.Z_SYNC_FLUSH, level: zlib.Z_BEST_COMPRESSION }))
                                            .pipe(client);

                                        client
                                            .pipe(zlib.createInflateRaw({ flush: zlib.Z_SYNC_FLUSH, level: zlib.Z_BEST_COMPRESSION }))
                                            .pipe(c);
                                    } else {
                                        c.pipe(client);
                                        client.pipe(c);
                                    }

                                    c.on('close', function () {
                                        Log('客户端连接断开');

                                        client.write(cmd + 'CONNECT:CLOSE', 'utf8');

                                        //listenerClient.close();
                                        //if (client) {
                                        //    client.end(cmd +'LOGINOUT', 'utf8');
                                        //}
                                    });

                                    c.on('error', function (err) {
                                        if (err.errno === 'ECONNRESET') {
                                            Log('客户端连接重置');
                                            return;
                                        }
                                        if (err.message === 'write after end') {
                                            Log(
                                                util.format(
                                                    '%s:%d write after end',
                                                    dest.host,
                                                    dest.port
                                                )
                                            );
                                            return;
                                        }
                                        Log('err.code', err.code);
                                        Log('err.errno', err.errno);
                                        Log('err.message', err.message);
                                        Log('ERROR', err);
                                    });

                                    c.on('data', function (buf) {
                                        //outLength += buf.length;
                                        //console.log(util.format('<< %d \r\n', buf.length));
                                        //console.log(buf.toString('hex'));
                                    });
                                })
                                .listen(lport, function () {
                                    Log(
                                        '反向代理端口已开启：%d 等待客户端连接', lport
                                    );
                                });
                            return;
                        }

                        //请求失败
                        //if (data === cmd +'CONNECT:NOTFOUND') {
                        //    return;
                        //}

                        //断开客户端连接
                        client.end(cmd + 'LOGINOUT', 'utf8');
                        //client.destroy();
                        return;
                    }
                }
            }
            //   else {
            //     //inLength += buf.length;
            //     console.log(util.format('>> %d \r\n', buf.length));
            //     console.log(buf.toString('hex'));
            //     if (buf.length < 512) console.log(buf.toString('utf8'));
            //   }
        });
    }
    connect();
    process.title = '客户端';
    return;
}
