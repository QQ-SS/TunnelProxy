'use strict';

// 隧道端调用参数
// node tunnel.js -p 8080
//

var port = 8080; //隧道服务器默认监听端口
const cmd = 'AT+'; //指令前缀，可自行修改成其它

//命令行支持
{
    var argvparser = function () {
        var args = require('arguments');
        args.parse(
            [{ name: /^(-p|-port)$/, expected: /\d+/, callback: setPort }],
            main,
            null
        );

        function setPort(end, val) {
            port = parseInt(val);
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
    var util = require('util');
    var natClients = {}; //内网客户端容器

    var listenerServer = net
        .createServer(function (c) {
            var connectId = util.format('%s:%d', c.remoteAddress, c.remotePort);
            var client = natClients[connectId] = {
                connectId: connectId,
                socket: c,
                clientType: 'UNKNOW',
                tunnelConnectId: null,
                connect: []
            };

            Log('会话 %s (%s) 进入', client.connectId, client.clientType);

            setTimeout(function () {
                //3秒后检查是否合法登陆
                if (client.clientType === 'UNKNOW') {
                    Log(
                        '会话 %s (%s) 登陆超时，强制断开',
                        client.connectId,
                        client.clientType
                    );
                    c.end();
                }
            }, 3000);

            c.on('close', function () {
                Log('会话 %s (%s) 断开', client.connectId, client.clientType);

                if (natClients.hasOwnProperty(connectId)) {
                    let item = natClients[connectId];
                    if (item.tunnelConnectId !== null) {
                        if (natClients.hasOwnProperty(item.tunnelConnectId)) {
                            natClients[item.tunnelConnectId].tunnelConnectId = null;
                            natClients[item.tunnelConnectId].socket.end(cmd + 'KILL', 'utf8');
                        }
                    }
                    delete natClients[connectId];
                }
            });

            c.on('data', function (buf) {

                if (client.tunnelConnectId === null) {
                    var data = buf.toString('utf8');
                    Log(
                        '会话 %s (%s) 数据：{%s}',
                        client.connectId,
                        client.clientType,
                        data
                    );

                    if (client.clientType === 'UNKNOW') {
                        if (data === cmd + 'LOGIN:NATSERVER') {
                            c.write(cmd + 'LOGIN:OK', 'utf8');

                            client.clientType = 'NATSERVER';
                        } else if (data === cmd + 'LOGIN:NATCLIENT') {
                            c.write(cmd + 'LOGIN:OK', 'utf8');

                            client.clientType = 'NATCLIENT';
                        } else {
                            //不合法客户端
                            Log(
                                '会话 %s (%s) 不合法登陆数据',
                                client.connectId,
                                client.clientType
                            );
                            c.end();
                        }
                        return;
                    }
                    if (data.startsWith(cmd + 'REGISTER:')) {
                        //服务端请求注册可使用指令
                        if (client.clientType === 'NATSERVER') {
                            if (natClients.hasOwnProperty(connectId)) {
                                let item = natClients[connectId];
                                let ireged = 0;
                                item.connect = [];

                                JSON.parse(data.replace(cmd + 'REGISTER:', '')).forEach(
                                    element => {
                                        if (
                                            element.hasOwnProperty('host') &&
                                            element.hasOwnProperty('port')
                                        ) {
                                            item.connect.push(element);
                                            ireged += 1;
                                        }
                                    }
                                );
                                if (ireged > 0) c.write(cmd + 'REGISTER:OK', 'utf8');
                            }
                            return;
                        }
                        c.end();
                    }
                    if (data.startsWith(cmd + 'CONNECT:')) {
                        //客户端请求连接指令
                        if (client.clientType === 'NATCLIENT') {
                            let find = false;
                            const dest = JSON.parse(data.replace(cmd + 'CONNECT:', ''));
                            for (var id in natClients) {
                                if (natClients.hasOwnProperty(id)) {
                                    let item = natClients[id];
                                    if (
                                        item.clientType === 'NATSERVER' &&
                                        item.tunnelConnectId === null
                                    ) {
                                        for (let index = 0; index < item.connect.length; index++) {
                                            const element = item.connect[index];
                                            if (
                                                element.host === dest.host &&
                                                element.port === dest.port
                                            ) {
                                                find = true;
                                                //重写指令
                                                item.socket.write(data, 'utf8');

                                                client.tunnelConnectId = item.connectId;
                                                item.tunnelConnectId = connectId;
                                                item.socket.pipe(c);
                                                c.pipe(item.socket);
                                                break;
                                            }
                                        }
                                        if (find) break;
                                    }
                                }
                            }

                            if (!find) {
                                c.write(cmd + 'CONNECT:NOTFOUND', 'utf8');
                            }
                            return;
                        }
                        c.end();
                    }
                }
            });

            c.on('error', function (err) {
                if (err.code === 'ECONNRESET') {
                    Log('会话 %s (%s) 重置', client.connectId, client.clientType);
                    return;
                }
                if (err.message === 'write after end') {
                    Log('会话 %s (%s) write after end', client.connectId, client.clientType);
                    return;
                }
                Log('err.code', err.code);
                Log('err.errno', err.errno);
                Log('err.message', err.message);
                Log('Error', err);
            });
        })
        .listen(port, function () {
            Log('隧道端口已开启： ' + port);
        });

    process.title = '隧道端';
    return;
}
