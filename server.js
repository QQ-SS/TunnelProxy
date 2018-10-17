'use strict';

// 服务器端调用参数
// node server.js -h localhost -p 8080 -s "127.0.0.1:3389;127.0.0.1:3306"
//

var host = 'localhost'; //隧道服务器默认的IP或者域名
var port = 8080; //隧道服务器默认监听端口
var serverList = '[{"port":3389, "host":"localhost"}]';
const cmd = 'AT+'; //指令前缀，可自行修改成其它

//命令行支持
{
    var argvparser = function () {
        var args = require('arguments');

        function setHost(end, val) {
            host = val;
            end();
        }
        function setPort(end, val) {
            port = parseInt(val);
            end();
        }
        function setServerList(end, val) {
            let sl = [];
            val.split(';').forEach(element => {
                let pa = /(.+):(\d+)/g.exec(element);
                if (pa) {
                    sl.push({
                        host: pa[1],
                        port: parseInt(pa[2])
                    });
                }
            });

            serverList = JSON.stringify(sl);
            end();
        }

        args.parse(
            [
                { name: /^(-h|-host)$/, expected: /.+/, callback: setHost },
                { name: /^(-p|-port)$/, expected: /\d+/, callback: setPort },
                { name: /^(-s|-server)$/, expected: /.+/, callback: setServerList }
            ],
            main,
            null
        );
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
    function connect() {
        var net = require('net');
        var zlib = require('zlib');
        var util = require('util');
        var timerHeartBeat = null;
        var loc = null;
        var dest = null;

        //生成心跳定时
        var doOpenHeartBeat = function () {
            timerHeartBeat = setInterval(function () {
                client.write(cmd + 'HEARTBEAT', 'utf8');
            }, 10 * 1000);

        };
        //停止心跳检测
        var doCloseHeartBeat = function () {
            if (timerHeartBeat) {
                clearInterval(timerHeartBeat);
            }
        };


        var doConnect = function (first) {
            loc = net.connect(
                dest,
                function () {
                    Log(util.format('%s:%d 连接成功', dest.host, dest.port));
                    if (first) client.write(cmd + 'CONNECT:OK', 'utf8');

                    //停止心跳检测
                    doCloseHeartBeat();

                    if (dest.compress) {
                        loc
                            .pipe(zlib.createDeflateRaw({ flush: zlib.Z_SYNC_FLUSH, level: zlib.Z_BEST_COMPRESSION }))
                            .pipe(client);
                        client
                            .pipe(zlib.createInflateRaw({ flush: zlib.Z_SYNC_FLUSH, level: zlib.Z_BEST_COMPRESSION }))
                            .pipe(loc);
                    }
                    else {
                        loc.pipe(client);
                        client.pipe(loc);
                    }
                }
            );

            loc.on('close', function () {
                //if (client) client.end();
                Log(util.format('%s:%d 连接断开', dest.host, dest.port));
            });

            loc.on('error', function (err) {
                if (first) {
                    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
                        Log(util.format('%s:%d ' + err.code, dest.host, dest.port));
                        client.write(cmd + 'CONNECT:' + err.code, 'utf8');
                        return;
                    }
                }

                if (err.code === 'ECONNRESET') {
                    Log(util.format('%s:%d 连接重置', dest.host, dest.port));
                    return;
                }
                if (err.message === 'write after end') {
                    Log(util.format('%s:%d write after end', dest.host, dest.port));
                    return;
                }
                Log('err.code', err.code);
                Log('err.errno', err.errno);
                Log('err.message', err.message);
                Log('ERROR', err);
            });

            loc.on('data', function (buf) {
                //outLength += buf.length;
                //console.log(util.format('<< %d \r\n', buf.length));
                //console.log(buf.toString('hex'));
            });
        };

        var client = net.connect(
            port,
            host,
            function () {
                Log('隧道服务端：%s:%d 连接成功', host, port);
                client.write(cmd + 'LOGIN:NATSERVER', 'utf8');
            }
        );

        //client.on('connect', function () {
        //});

        client.on('error', function (err) {
            Log('隧道服务端：%s:%d 连接失败 %s', host, port, err.code);
        });

        client.on('close', function () {
            Log('隧道服务端：%s:%d 连接已关闭', host, port);

            if (loc) loc.end();
            setTimeout(connect, 5000);
        });

        client.on('data', function (buf) {
            if (buf.length < 512) {
                var data = buf.toString('utf8');
                if (data.startsWith(cmd)) {
                    console.log('recv data:' + data);

                    //登陆成功，上报可用网关
                    if (data === cmd + 'LOGIN:OK') {
                        client.write(
                            cmd + 'REGISTER:' + serverList,
                            'utf8'
                        );
                        return;
                    }

                    //注册成功
                    if (data === cmd + 'REGISTER:OK') {
                        //生成心跳定时
                        doOpenHeartBeat();
                        return;
                    }


                    //客户端退出
                    if (data === cmd + 'CONNECT:CLOSE') {
                        if (loc) {
                            loc.end();
                        }
                        doConnect();
                        return;
                    }

                    //收到登陆请求
                    if (data.startsWith(cmd + 'CONNECT:')) {
                        dest = JSON.parse(data.replace(cmd + 'CONNECT:', ''));
                        doConnect(true);
                        return;
                    }
                }
            }
            //else {
            //    //inLength += buf.length;
            //    console.log(util.format('>> %d \r\n', buf.length));
            //    console.log(buf.toString('hex'));
            //    if (buf.length < 512)
            //        console.log(buf.toString('utf8'));
            //}
        });
    }
    connect();
    process.title = '服务端';
    return;
}
