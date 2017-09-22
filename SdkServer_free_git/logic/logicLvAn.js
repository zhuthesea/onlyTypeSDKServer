/**
 * Created by TypeSDK 2016/10/10.
 */
var crypto = require('crypto');
var request = require('request');
var merge = require('merge');
var logicCommon = require('./logicCommon.js');

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

    ret.access_token = cloned.token;
    ret.user_id = cloned.id;
    ret.version = cloned.version;
    return true;
}
function createsign(obj,attrs){
    var cloned = merge(true,obj);
    var key = Object.keys(cloned);
    for(var i=0;i< key.length;i++) {
        if (!obj[key[i]] || obj[key[i]] == 0||obj[key[i]]=='') {
            delete cloned[key[i]];
        }
    }
    delete cloned.sign_type;
    delete cloned.sign;

    var data =logicCommon.sortObject(cloned);
    var key2  = Object.keys(data);
    var str = '';
    for(var i=0;i< key2.length;i++){
        if(i==(key2.length-1)){
            str+=key2[i]+'='+data[key2[i]];
        }else{
            str+=key2[i]+'='+data[key2[i]]+'&';
        }
    }
    console.log(str+attrs.secret_key);
    //return crypto.createHash('md5').update(logicCommon.utf16to8(str)+'#'+attrs.secret_key).digest('hex');
    return crypto.createHash('md5').update(str +'#'+attrs.secret_key).digest('hex');
}

function callChannelLogin(attrs,params,query,ret,retf)
{
    var cloned = merge(true, params.out_params);
    merge(cloned,query);
    cloned.app_id = attrs.app_id;
    cloned.app_key = attrs.app_key;
    cloned.app_secret = attrs.secret_key;
    cloned.version ="1.1" ;
    var options = {
        url: params.out_url,
        method:params.method,
        form: cloned,
        rejectUnauthorized: false,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    };

    console.log(options);
    //打点：登录验证
    logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.RelaySDKVerify);
    request(options, function(error,response,body) {
        if (!error && response.statusCode == 200) {
            var retOut = body;

            console.log(retOut);
            retOut = JSON.parse(retOut);

            if(retOut.ret==0){
                //打点：验证成功
                logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifySuc);
                ret.code = 0;
                ret.msg = "NORMAL";
                ret.id = retOut.data.user_id;
                ret.nick = retOut.data.username;
                ret.token = "";
                ret.value = retOut;
            }else{
                //打点：验证失败
                logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifyErr);
                ret.code =  1;
                ret.msg = "LOGIC SIGN ERROR";
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
    var retValue = {};
    retValue.code = query.payment_status  == 0 ? 0 : 1;
    retValue.id = query.user_id;
    retValue.order = query.order_on;
    retValue.cporder = query.app_order_no || '';
    retValue.info = '';
    if(retValue.code!='0'){
        retf('FAILURE');
        return;
    }
    logicCommon.getNotifyUrl(retValue.cporder,params,function(hasData) {
        if (!hasData) {
            retf('FAILURE');
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
                        retf('FAILURE');
                        return;
                    }
                    if(retOut.code=='0'){
                        if(retOut.Itemid){
                            logicCommon.mapItemLists(attrs,retOut);
                        }
                        if(query.app_order_no==retOut.cporder
                            &&(query.amount)*100>=retOut.amount*0.9
                            &&(query.amount)*100<=retOut.amount){
                                if(retOut.status=='2'){
                                    retf('FAILURE');
                                    return;
                                }else if(retOut.status=='4'||retOut.status=='3'){
                                    logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,4,query.amount*100);
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
                            retf('FAILURE');
                            return;
                        }
                    }else{
                        retf('FAILURE');
                        return;
                    }
                }else{
                    retf('FAILURE');
                    return;
                }
            });
        }
    });
}

function callGamePay(attrs,gattrs,params,query,ret,retf,game,channel,channelId)
{
    //此处获取转换为内部订单号
    var retValue = {};
    retValue.code = query.payment_status  == 0 ? 0 : 1;
    retValue.id = query.user_id;
    retValue.order = query.order_on;
    retValue.cporder = query.app_order_no || '';
    retValue.info = '';
    if(retValue.code!='0'){
        //打点：其他支付失败
        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
        retf('FAILURE');
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
            retValue.amount = '' + (query.amount)*100+ '';

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
                        retf('FAILURE');return;
                    }

                    if (retOut.code == 0)
                    {
                        //打点：服务器正确处理支付成功回调
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.PaySuc);
                        logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,4,query.amount*100);
                        retf('success');
                        //retf('FAILURE');
                    }
                    else {
                        //打点：其他支付失败
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
                        retf('FAILURE');
                    }
                }else
                {
                    //打点：其他支付失败
                    logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
                    retf('FAILURE');
                }
            });
        }
    });
}

function checkSignPay(attrs,query)
{
    var osign = createsign(query,attrs);
    console.log(query.sign + " :: " + osign);

    if (query.sign != osign)
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
    var isIllegal = false;
    logicCommon.selCHOrderInRedis(channel,query.order_on,function(res){
        if(!res || typeof res == "undefined"){
            logicCommon.saveCHOrderInRedis(game, channel, query.app_order_no || '', query.order_on,function(res){
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

exports.compareOrder =compareOrder;
exports.checkChOrder = checkChOrder;