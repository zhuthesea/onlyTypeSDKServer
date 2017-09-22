/**
 * Created by TypeSDK on 2016/10/10.
 */
var crypto = require('crypto');
var request = require('request');
var merge = require('merge');
var logicCommon = require('./logicCommon.js');
var rsa = require('node-rsa');

function convertParamLogin(query,ret)
{
    var org =
    {
        "id" : "0"
        ,"token": ""
        ,"data":""
        ,"sign":""
    };

    var cloned = merge(true, org);
    merge(cloned,query);
    for(var i in cloned)
    {
        //判断参数中是否该有的字段齐全
        if(org[i] == cloned[i] && i != "data" && i != "id")
        {
            return false;
        }
        //判断参数中是否有为空的字段
        if(0 == (cloned[i] + "").replace(/(^s*)|(s*$)/g, "").length && i != "data" && i != "id")
        {
            return false;
        }
    }
    ret.sessionid = cloned.token;
    return true;
}



function callChannelLogin(attrs,params,query,ret,retf)
{
    var cloned = merge(true, params.out_params);
    merge(cloned,query);
    cloned.sessionid = query.sessionid;
    cloned.appid =  attrs.app_id;
    var str = "appid="+attrs.app_id+"&"+"sessionid="+ query.sessionid;
    cloned.sign =  crypto.createHash('md5').update(str).digest('hex');
    var options = {
        url: params.out_url,
        method:params.method,
        qs: cloned
    };
    console.log(str);
    console.log(options);
    //打点：登录验证
    logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.RelaySDKVerify);
    request(options, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var retOut = JSON.parse(body);
            console.log(retOut);
            if( retOut.status == 'success'){
                //打点：验证成功
                logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifySuc);
                ret.code = 0;
                ret.msg = "NORMAL";
                ret.id = query.sessionid.split("_",2)[0];
                ret.nick = "";
                ret.token = query.sessionid;
                ret.value = retOut;
            }
            else
            {
                //打点：验证失败
                logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifyErr);
                ret.code =  1;
                ret.msg = "LOGIN User ERROR";
                ret.id = "";
                ret.nick = "";
                ret.token = "";
                ret.value = retOut;
            }
        }
        else
        {
            //打点：验证失败
            logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifyErr);
            ret.code = 2;
            ret.msg = "OUT URL ERROR";
            ret.value = "";
        }
        retf(ret);
    });
}
function compareOrder(attrs,gattrs,params,query,ret,game,channel,retf){
    var tempPublicKey = attrs.product_key;
    var beginArray = new Array();
    beginArray.push('-----BEGIN PUBLIC KEY-----');
    var strArray = logicCommon.returnBase64Array(tempPublicKey);
    strArray.push("-----END PUBLIC KEY-----");
    beginArray = beginArray.concat(strArray);
    for(var i = 0; i<beginArray.length;i++){
        if(i != beginArray.length-1)
            beginArray[i] = beginArray[i]+ "\r\n";
    }
    var publickey  = beginArray.join("");
    var key = new rsa(publickey);
    var strSign = key.decryptPublic(query.notify_data, 'utf8');
    var retdata = JSON.parse(strSign);
    var retValue = {};
    retValue.code = retdata.result=='success'?'0':'1';
    retValue.id = retdata.user_id;
    retValue.order = retdata.order_id;
    var cporderId = retdata.order_id_com;
    retValue.cporder =  cporderId.substring(0,cporderId.indexOf('|'));
    retValue.info = "";
    if(retValue.code!='0'){
        retf('fail');
        return;
    }
    logicCommon.getNotifyUrl(retValue.cporder,params,function(hasData) {
        if (!hasData) {
            retf('fail');
            return;
        } else {
            retValue.sign = logicCommon.createSignPay(retValue,gattrs.gkey);
            logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,1,0,query);
            var options = {
                url: params.verifyurl,
                method: "POST",
                body: retValue,
                json: true
            };
            request(options, function (error, response, body) {
                if(!error && response.statusCode == 200){
                    var retOut = body;
                    if (typeof retOut.code == 'undefined'){
                        retf('fail');
                        return;
                    }
                    console.log(retOut);
                    if(retOut.code=='0'){
                        if(retOut.Itemid){
                            logicCommon.mapItemLists(attrs,retOut);
                        }
                        if(retdata.amount * 100>=retOut.amount*0.9
                            &&retdata.amount * 100<=retOut.amount){
                            if(retOut.status=='2'){
                                retf('fail');
                                return;
                            }else if(retOut.status=='4'||retOut.status=='3'){
                                logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,4,retdata.amount * 100);
                                retf('success');
                                return;
                            }else{
                                logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,2,0);
                                var data  = {};
                                data.code = '0000';
                                data.msg = 'NORMAL';
                                retf(data);
                                return;
                            }
                        }else{
                            logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,3,0);
                            retf('fail');
                            return;
                        }
                    }else{
                        retf('fail');
                        return;
                    }

                }else{
                    retf('fail');
                    return;
                }
            });
        }
    });

}
function callGamePay(attrs,gattrs,params,query,ret,retf,game,channel,channelId)
{
    var tempPublicKey = attrs.product_key;
    var beginArray = new Array();
    beginArray.push('-----BEGIN PUBLIC KEY-----');
    var strArray = logicCommon.returnBase64Array(tempPublicKey);
    strArray.push("-----END PUBLIC KEY-----");
    beginArray = beginArray.concat(strArray);
    for(var i = 0; i<beginArray.length;i++){
        if(i != beginArray.length-1)
            beginArray[i] = beginArray[i]+ "\r\n";
    }
    var publickey  = beginArray.join("");
    var key = new rsa(publickey);
    var strSign = key.decryptPublic(query.notify_data, 'utf8');
    var data = JSON.parse(strSign);
    var retValue = {};
    retValue.code = data.result=='success'?'0':'1';
    retValue.id = data.user_id;
    retValue.order = data.order_id;
    var cporderId = data.order_id_com;
    retValue.cporder =  cporderId.substring(0,cporderId.indexOf('|'));
    retValue.info = "";
    if(retValue.code!='0'){
        //打点：其他支付失败
        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
        retf('fail');
        return;
    }
    logicCommon.getNotifyUrl(retValue.cporder,params,function(hasData) {
        if (!hasData) {
            //打点：其他支付失败
            logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
            retf('FAILURE');
        } else {
            retValue.sign = logicCommon.createSignPay(retValue,gattrs.gkey);
            retValue.gamename = game;
            retValue.sdkname = channel;
            retValue.channel_id = channelId;
            retValue.amount = '' + data.amount * 100 + '';
            var options = {
                url: params.out_url,
                method: params.method,
                body: retValue,
                json: true
            };
            console.log(options);
            //打点：支付回调通知
            logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.PayNotice);
            request(options, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    var retOut = body;
                    //日志记录CP端返回
                    console.log(retOut);
                    if (typeof retOut.code == 'undefined'){
                        //打点：其他支付失败
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
                        retf('fail');
                    }
                    if (retOut.code == 0)
                    {
                        //打点：服务器正确处理支付成功回调
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.PaySuc);
                        logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,4,retdata.amount * 100);
                        retf('success');
                    }
                    else {
                        //打点：其他支付失败
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
                        retf('fail');
                    }
                }else
                {
                    //打点：其他支付失败
                    logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
                    retf('fail');
                }
            });
        }
    });
}

function checkSignPay(attrs,query)
{

    var tempPublicKey = attrs.product_key;
    var beginArray = new Array();
    beginArray.push('-----BEGIN PUBLIC KEY-----');
    var strArray = logicCommon.returnBase64Array(tempPublicKey);
    strArray.push("-----END PUBLIC KEY-----");
    beginArray = beginArray.concat(strArray);
    for(var i = 0; i<beginArray.length;i++){
        if(i != beginArray.length-1)
            beginArray[i] = beginArray[i]+ "\r\n";
    }
    var publickey  = beginArray.join("");
    var key = new rsa(publickey);
    var strSign = key.decryptPublic(query.notify_data, 'utf8');
    var data = JSON.parse(strSign);
    if (data.result != 'success')
    {
        return false;
    }
    return true;

}

function checkOrder()
{
    return false;
}

/**
 * 核实外部订单号的唯一性
 * @param
 *      query   请求串Obj
 *      retf    返回校验结果 True 合法|False 不合法
 * */
function checkChOrder(game, channel,attrs, query, retf){
    var tempPublicKey = attrs.product_key;
    var strArray = logicCommon.returnBase64Array(tempPublicKey);
    strArray[0] = "-----BEGIN PUBLIC KEY-----";
    strArray[strArray.length] = "-----END PUBLIC KEY-----";
    for(var i in strArray){
        if(i != strArray.length -1)
            strArray[i] = strArray[i]+ "\r\n";
    }
    var publickey = strArray.join("");
    var key = new rsa(publickey);
    var strSign = key.decryptPublic(query.notify_data, 'utf8');
    var data = JSON.parse(strSign);

    var isIllegal = false;
    logicCommon.selCHOrderInRedis(channel,data.order_id,function(res){
        if(!res || typeof res == "undefined"){
            logicCommon.saveCHOrderInRedis(game, channel, data.order_id_com, data.order_id,function(res){
                if(res && typeof res != "undefined"){
                    isIllegal = true;
                    retf(isIllegal);
                }else{
                    retf(isIllegal);
                }
            });
        }else{
            retf(isIllegal);
        }
    });
}

exports.convertParamLogin = convertParamLogin;
exports.callChannelLogin = callChannelLogin;
exports.checkSignPay = checkSignPay;
exports.callGamePay = callGamePay;
exports.checkOrder = checkOrder;
exports.compareOrder=compareOrder;
exports.checkChOrder = checkChOrder;