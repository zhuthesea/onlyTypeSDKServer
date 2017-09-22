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

    ret.code = cloned.token;

    return true;
}

function callChannelLogin(attrs,params,query,ret,retf)
{
    var cloned = merge(true, params.out_params);
    merge(cloned,query);
    cloned.client_id = attrs.product_id;
    cloned.version ='v2.1.0';
    cloned.sign_method = 'MD5';
    cloned.timestamp = new Date().getTime();
    cloned.client_secret = attrs.product_key;

    cloned.grant_type='authorization_code';
    cloned.scope='';
    cloned.state='';

    cloned.sign_sort = 'timestamp&sign_method&client_secret&client_id&version';

    var str = cloned.timestamp+cloned.sign_method+cloned.client_secret+cloned.client_id+cloned.version;
    cloned.signature =  crypto.createHash('md5').update(logicCommon.utf8to16(str)).digest('hex');

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

    request(options, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var retOut = JSON.parse(body);

            if(retOut.user_id){
                //打点：验证成功
                logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifySuc);

                ret.code = 0;
                ret.msg = "NORMAL";
                ret.id = retOut.user_id;
                ret.nick = '';
                ret.token = "";
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
    var retValue = {};
    retValue.code = query.result_code  == '00' ? 0 : 1;
    retValue.id = '';
    retValue.order = query.correlator;
    retValue.cporder = query.cp_order_id;
    retValue.info = '';
    //console.log(retValue);
    if(retValue.code!='0'){
        retf('<cp_notify_resp><h_ret>-1</h_ret><cp_order_id>'+query.cp_order_id+'</cp_order_id></cp_notify_resp>');return;
    }
    logicCommon.getNotifyUrl(retValue.cporder,params,function(hasData) {
        if (!hasData) {
            retf('<cp_notify_resp><h_ret>-1</h_ret><cp_order_id>'+query.cp_order_id+'</cp_order_id></cp_notify_resp>');
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

                        retf('<cp_notify_resp><h_ret>-1</h_ret><cp_order_id>'+query.cp_order_id+'</cp_order_id></cp_notify_resp>');
                        return;
                    }
                    console.log(retOut);
                    if(retOut.code =='0'){
                        if(retOut.Itemid){
                            logicCommon.mapItemLists(attrs,retOut);
                        }
                        if(query.fee*100>=retOut.amount*0.9
                            &&query.fee*100<=retOut.amount){
                                if(retOut.status=='2'){
                                    retf('<cp_notify_resp><h_ret>-1</h_ret><cp_order_id>'+query.cp_order_id+'</cp_order_id></cp_notify_resp>');
                                    return;
                                }else if(retOut.status=='4'||retOut.status=='3'){
                                    logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,4,query.fee*100);
                                    retf('<cp_notify_resp><h_ret>0</h_ret><cp_order_id>'+query.cp_order_id+'</cp_order_id></cp_notify_resp>');
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
                            retf('<cp_notify_resp><h_ret>-1</h_ret><cp_order_id>'+query.cp_order_id+'</cp_order_id></cp_notify_resp>');
                            return;
                        }
                    }else{
                        retf('<cp_notify_resp><h_ret>-1</h_ret><cp_order_id>'+query.cp_order_id+'</cp_order_id></cp_notify_resp>');
                        return;
                    }
                }else{
                    retf('<cp_notify_resp><h_ret>-1</h_ret><cp_order_id>'+query.cp_order_id+'</cp_order_id></cp_notify_resp>');
                    return;
                }
            });
        }
    });
}

function callGamePay(attrs,gattrs,params,query,ret,retf,game,channel,channelId)
{

    var retValue = {};
    retValue.code = query.result_code  == '00' ? 0 : 1;
    retValue.id = '';
    retValue.order = query.correlator;
    retValue.cporder = query.cp_order_id;
    retValue.info = '';
    if(retValue.code!='0'){
        //打点：其他支付失败
        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
        retf('<cp_notify_resp><h_ret>-1</h_ret><cp_order_id>'+query.cp_order_id+'</cp_order_id></cp_notify_resp>');return;
    }

    logicCommon.getNotifyUrl(retValue.cporder,params,function(hasData) {
        if (!hasData) {
            //打点：其他支付失败
            logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
            retf('<cp_notify_resp><h_ret>-1</h_ret><cp_order_id>'+query.cp_order_id+'</cp_order_id></cp_notify_resp>');
        } else {
            retValue.sign = logicCommon.createSignPay(retValue,gattrs.gkey);

            retValue.gamename = game;
            retValue.sdkname = channel;
            retValue.channel_id = channelId;
            retValue.amount = '' + query.fee*100 + '';

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
                        retf('<cp_notify_resp><h_ret>-1</h_ret><cp_order_id>'+query.cp_order_id+'</cp_order_id></cp_notify_resp>');return;
                    }

                    if (retOut.code == 0)
                    {
                        //打点：服务器正确处理支付成功回调
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.PaySuc);

                        logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,4,query.fee*100);
                        retf('<cp_notify_resp><h_ret>0</h_ret><cp_order_id>'+query.cp_order_id+'</cp_order_id></cp_notify_resp>');
                        //retf('FAILURE');
                    }else{
                        //打点：其他支付失败
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
                        retf('<cp_notify_resp><h_ret>-1</h_ret><cp_order_id>'+query.cp_order_id+'</cp_order_id></cp_notify_resp>');
                    }

                }else
                {
                    //打点：其他支付失败
                    logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
                    retf('<cp_notify_resp><h_ret>-1</h_ret><cp_order_id>'+query.cp_order_id+'</cp_order_id></cp_notify_resp>');
                }
            });
        }
    });
}

function checkSignPay(attrs,query)
{
    var str = query.cp_order_id +
        query.correlator +
        query.result_code +
        query.fee +
        query.pay_type +
        query.method;
    //var osign = crypto.createHash('md5').update(logicCommon.utf16to8(str)+ attrs.app_key).digest('hex');
    var osign = crypto.createHash('md5').update(str+ attrs.app_key).digest('hex');

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
    logicCommon.selCHOrderInRedis(channel,query.order_id,function(res){
        if(!res || typeof res == "undefined"){
            logicCommon.saveCHOrderInRedis(game, channel, query.app_order_id, query.order_id,function(res){
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