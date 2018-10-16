# TunnelProxy

反弹式Socket代理程序

## Installation

    cd path/to/your/source
    git clone https://github.com/WangXQ-git/TunnelProxy.git

## Usage

### 安装依赖

    npm install

### 隧道端

隧道端必须执行在公网IP环境下

    node tunnel.js -p 8080

### 服务端

服务端用于提供TCP服务，需要与被访问服务器在同一内网中

    node server.js -h IP/hostname -p 8080 -s "localhost:3389;127.0.0.1:3306;192.168.0.1:3389"

### 客户端

客户端运行于本地，指定将本地的 3399 端口转向到远程服务端的 localhost:3389 端口服务

    node client.js -h IP/hostname -p 8080 -t "localhost:3389" -l 3399


## License

Copyright (c) 2018 WangXQ-git 

>## Node Arguments
>A simple command line arguments parser for node.js... Yes, another! :)
>
>$ npm install [arguments][node-arguments] 
>
>Copyright (c) 2010 Fabricio Campos Zuardi
>Released under the MIT License.
>
>
>## dateformat
>A node.js package for Steven Levithan's excellent [dateFormat()][dateformat] function.
>
>$ npm install [dateformat][node-dateformat]
>
>(c) 2007-2009 Steven Levithan [stevenlevithan.com][stevenlevithan], MIT license.
>
>[node-arguments]: http://github.com/fczuardi/node-arguments
>[node-dateformat]: https://github.com/felixge/node-dateformat
>[dateformat]: http://blog.stevenlevithan.com/archives/date-time-format
>[stevenlevithan]: http://stevenlevithan.com/
>