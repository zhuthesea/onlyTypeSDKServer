/**
 * Created by TypeSDK 2017/1/5.
 */
var crypto = require('crypto');
var request = require('request');
var merge = require('merge');
var logicCommon = require('./logicCommon.js');
var xmlreader = require('xmlreader');
var rsa = require('node-rsa');

function convertParamLogin(query, ret) {
    var org =
    {
        "id": "0"
        , "token": ""
        , "data": ""
        , "sign": ""
    };

    var cloned = merge(true, org);
    merge(cloned, query);

    for (var i in cloned) {
        //判断参数中是否该有的字段齐全
        if (org[i] == cloned[i] && i != "data" && i != "id") {
            return false;
        }

        //判断参数中是否有为空的字段
        if (0 == (cloned[i] + "").replace(/(^s*)|(s*$)/g, "").length && i != "data" && i != "id") {
            return false;
        }
    }
    ret.lpsust = cloned.token;

    return true;
}


function callChannelLogin(attrs, params, query, ret, retf) {
    var cloned = merge(true, params.out_params);
    merge(cloned, query);
    cloned.lpsust = query.lpsust;
    cloned.realm = attrs.app_id;
    var options = {
        url: params.out_url,
        method: params.method,
        qs: cloned
    };

    console.log(options);
    //打点：登录验证
    logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.RelaySDKVerify);
    request(options, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var retOut = body;
            xmlreader.read(retOut, function (err, res) {
                if (!res.IdentityInfo.AccountID.text()) {
                    //打点：验证失败
                    logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifyErr);
                    ret.code = 1;
                    ret.msg = "LOGIN User ERROR";
                    ret.id = "";
                    ret.nick = "";
                    ret.token = "";
                    ret.value = retOut;


                }
                else {
                    //打点：验证成功
                    logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifySuc);
                    ret.code = 0;
                    ret.msg = "NORMAL";
                    ret.id = res.IdentityInfo.AccountID.text();
                    ret.nick = "";
                    ret.token = query.lpsust;
                    ret.value = retOut;
                }
            });
        }
        else {
            //打点：验证失败
            logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifyErr);
            ret.code = 2;
            ret.msg = "OUT URL ERROR";
            ret.value = "";
        }
        retf(ret);
    });
}
function compareOrder(attrs, gattrs, params, query, ret, game, channel, retf) {
    var transdata = JSON.parse(query.transdata);
    console.log(transdata);
    var retValue = {};
    retValue.code = transdata.result == '0' ? '0' : '1';
    retValue.id = transdata.cpprivate;
    retValue.order = transdata.transid;
    retValue.cporder = transdata.exorderno;
    retValue.info = "";
    console.log(transdata);
    if (retValue.code != '0') {
        retf('FAILURE');
        return;
    }
    logicCommon.getNotifyUrl(retValue.cporder, params, function (hasData) {
        if (!hasData) {
            retf('FAILURE');
            return;
        } else {
            retValue.sign = logicCommon.createSignPay(retValue, gattrs.gkey);
            logicCommon.UpdateOrderStatus(game, channel, retValue.cporder, retValue.order, 1, 0,query);
            var options = {
                url: params.verifyurl,
                method: "POST",
                body: retValue,
                json: true
            };
            console.log(options);
            request(options, function (error, response, body) {

                if (!error && response.statusCode == 200) {
                    var retOut = body;
                    if (typeof retOut.code == 'undefined') {
                        retf('FAILURE');
                        return;
                    }
                    if (retOut.code == '0') {
                        if(retOut.Itemid){
                            logicCommon.mapItemLists(attrs,retOut);
                        }
                        if (transdata.cpprivate == retOut.id
                            && transdata.exorderno == retOut.cporder
                            && transdata.money >= retOut.amount * 0.9
                            && transdata.money <= retOut.amount) {
                            if (retOut.status == '2') {
                                retf('FAILURE');
                                return;
                            } else if (retOut.status == '4' || retOut.status == '3') {
                                logicCommon.UpdateOrderStatus(game, channel, retValue.cporder, retValue.order, 4,transdata.money);
                                retf('SUCCESS');
                                return;
                            } else {
                                logicCommon.UpdateOrderStatus(game, channel, retValue.cporder, retValue.order, 2,0);
                                var data = {};
                                data.code = '0000';
                                data.msg = 'NORMAL';
                                retf(data);
                                return;
                            }
                        } else {
                            logicCommon.UpdateOrderStatus(game, channel, retValue.cporder, retValue.order, 3,0);
                            retf('FAILURE');
                            return;
                        }
                    } else {
                        retf('FAILURE');
                        return;
                    }
                } else {
                    retf('FAILURE');
                    return;
                }
            });
        }
    });
}

function callGamePay(attrs, gattrs, params, query, ret, retf, game, channel, channelId) {
    var transdata = JSON.parse(query.transdata);
    var retValue = {};
    retValue.code = transdata.result == '0' ? '0' : '1';
    retValue.id = transdata.cpprivate;
    retValue.order = transdata.transid;
    retValue.cporder = transdata.exorderno;
    retValue.amount = '' + transdata.money + '';
    retValue.info = "";

    if (retValue.code != '0') {
        //打点：其他支付失败
        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
        retf('FAILURE');
        return;
    }
    logicCommon.getNotifyUrl(retValue.cporder, params, function (hasData) {
        if (!hasData) {
            //打点：其他支付失败
            logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
            retf('FAILURE');
        } else {
            retValue.sign = logicCommon.createSignPay(retValue, gattrs.gkey);
            retValue.gamename = game;
            retValue.sdkname = channel;
            retValue.channel_id = channelId;
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
                    if (typeof retOut.code == 'undefined') {
                        //打点：其他支付失败
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
                        retf('FAILURE');
                    }

                    if (retOut.code == 0) {
                        //打点：服务器正确处理支付成功回调
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.PaySuc);
                        logicCommon.UpdateOrderStatus(game, channel, retValue.cporder, retValue.order, 4,transdata.money);
                        retf('SUCCESS');
                    }
                    else {
                        //打点：其他支付失败
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
                        retf('FAILURE');
                    }
                } else {
                    //打点：其他支付失败
                    logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
                    retf('FAILURE');
                }
            });
        }
    });
}

function checkSignPay(attrs, query) {
    var tempPublicKey = attrs.app_key;
    var beginArray = new Array();
    beginArray.push('-----BEGIN PRIVATE KEY-----');
    var strArray = logicCommon.returnBase64Array(tempPublicKey);
    strArray.push("-----END PRIVATE KEY-----");
    beginArray = beginArray.concat(strArray);
    console.log(beginArray);
    for (var i = 0; i < beginArray.length; i++) {
        if (i != beginArray.length - 1)
            beginArray[i] = beginArray[i] + "\n";
    }
    var privatekey = beginArray.join("");
    var s = crypto.createSign('SHA1');
    //s.update(logicCommon.utf16to8(query.transdata));
    s.update(query.transdata);
    var sign = s.sign(privatekey, 'base64');
    return sign === query.sign;
}

function checkOrder() {
    return false;
}

/**
 * 核实外部订单号的唯一性
 * @param
 *      query   请求串Obj
 *      retf    返回校验结果 True 合法|False 不合法
 * */
function checkChOrder(game, channel,attrs, query, retf){
    var transdata = JSON.parse(query.transdata);

    var isIllegal = false;
    logicCommon.selCHOrderInRedis(channel,transdata.transid,function(res){
        if(!res || typeof res == "undefined"){
            logicCommon.saveCHOrderInRedis(game, channel, transdata.exorderno, transdata.transid,function(res){
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

exports.compareOrder = compareOrder;
exports.checkChOrder = checkChOrder;