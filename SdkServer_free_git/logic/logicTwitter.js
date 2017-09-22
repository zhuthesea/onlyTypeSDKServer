/**
 * Created by TypeSDK 2016/10/10.
 */
var crypto = require('crypto');
var request = require('request');
var merge = require('merge');
var logicCommon = require('./logicCommon.js');
var Twitter = require('twitter');

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

    ret.userid = cloned.id;
    ret.access_token = cloned.token.split("|")[0];
    ret.secret = cloned.token.split("|")[1];

    return true;
}



function callChannelLogin(attrs,params,query,ret,retf)
{
    var client = new Twitter({
        consumer_key:attrs.app_key,
        consumer_secret: attrs.secret_key,
        access_token_key: query.access_token,
        access_token_secret: query.secret
    });

    var params = {id: query.userid};
    //打点：登录验证
    logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.RelaySDKVerify);
    client.get('statuses/lookup.json', params, function(error, body, response){
        if (!error && response.statusCode == 200) {
            if( body[0]['id'] != 'undefined'){
                //打点：验证成功
                logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifySuc);
                ret.code = 0;
                ret.msg = "NORMAL";
                ret.id = query.userid;
                ret.nick = '';
                ret.token = query.access_token;
                ret.value = '';
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
                ret.value = '';
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

function callGamePay(attrs,gattrs,params,query,ret,retf,game,channel,channelId)
{
    var retValue = {};
    retValue.code =  0;
    retValue.id = query.uid;
    retValue.order = query.oid;
    retValue.cporder = query.doid;
    retValue.info = query.remark;
    logicCommon.getNotifyUrl(retValue.cporder,params.out_url,function(hasData) {
        if (!hasData) {
            //打点：其他支付失败
            logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
            retf('FAILURE');
        } else {
            retValue.sign = logicCommon.createSignPay(retValue,gattrs.gkey);

            retValue.gamename = game;
            retValue.sdkname = channel;
            retValue.channel_id = channelId;

            logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,1,0,query);

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
                        retf('FAILURE');
                        return;
                    }

                    if (retOut.code == 0)
                    {
                        //打点：服务器正确处理支付成功回调
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.PaySuc);
                        logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,4,query.money*100);
                        var retDate = {};
                        retDate.state = 1;
                        retDate.data = null;
                        retDate.msg = '成功';
                        retf(retDate);
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
    var str = query.time + attrs.secret_key
        + query.oid + query.doid + query.dsid + query.uid + query.money + query.coin;

    var osign = crypto.createHash('md5').update(str).digest('hex');

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


function CreateChannelOrder(attrs,params,query,ret,retf)
{

    var retErrorData = {};
    var retData = {};
    if(typeof (query.playerid  || query.cporder || query.price) == 'undefined')
    {
        retErrorData.code = -1;
        retErrorData.msg = 'ERROR';
        retf(retErrorData);
    }
    else
    {
        retData.buy_amount = "1";
        retData.app_id = attrs.app_id;
        retData.uid = query.playerid;
        retData.pay_type = "0";
        retData.cp_order_id = query.cporder;
        retData.product_id = "0";
        retData.product_body = "";
        retData.product_subject = "";
        retData.product_unit = "";
        retData.total_price = query.price;
        retData.user_info = "";
        retData.sign_type = "md5";

        var str = 'app_id=' + retData.app_id + '&' +
            'buy_amount=' + retData.buy_amount + '&' +
            'cp_order_id=' + retData.cp_order_id + '&' +
            'create_time=' + retData.create_time + '&' +
            'pay_type=' + retData.pay_type + '&' +
            'product_body=' + retData.product_body  + '&' +
            'product_id=' + retData.product_id + '&' +
            'product_per_price=' + retData.total_price + '&' +
            'product_subject=' + retData.product_subject + '&' +
            'product_unit=' + retData.product_unit + '&' +
            'total_price=' +  retData.total_price + '&' +
            'uid=' + retData.uid + '&' +
            'user_info=' + retData.user_info +  ':' + attrs.secret_key;
        console.log(str);
        var osign = crypto.createHash('md5').update(str).digest('hex');
        var retStr = {};
        retData.sign = osign;
        retStr.code = 0;
        retStr.msg = 'NORMAL';
        retStr.playerid = query.playerid;
        retStr.order = retData.order_id;
        retStr.cporder = retData.order_id;
        retStr.data = retData;
        retf(JSON.stringify(retStr));

    }

}

function compareOrder(attrs,gattrs,params,query,ret,game,channel,retf){
    var retValue = {};
    retValue.code = 0;
    retValue.id = query.uid;
    retValue.order = query.orderid;
    retValue.cporder =  query.mark;
    retValue.info = "";
    logicCommon.getNotifyUrl(retValue.cporder,params,function(hasData){
        if(!hasData){
            retf('FAILURE');
            return;
        }else{
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
                    console.log(retOut);
                    if(retOut.code=='0'){
                        if(retOut.Itemid){
                            logicCommon.mapItemLists(attrs,retOut);
                        }
                        if(retOut.id==query.uid&&query.money*100>=retOut.amount*0.9
                            &&query.money*100<=retOut.amount){
                            if(retOut.status=='2'){
                                retf('FAILURE');
                                return;
                            }else if(retOut.status=='4'||retOut.status=='3'){
                                logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,4,query.money*100);
                                var retDate = {};
                                retDate.status = 2;
                                retDate.code = null;
                                retDate.money = query.money;
                                retDate.msg = "success";
                                retDate.gamemoney = query.gamemoney;
                                retf(retDate);
                                return;
                            }else{
                                logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,2,0);
                                var data  = {};
                                data.code = '0000';
                                data.msg = 'NORMal';
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
                    retf('Failure');
                    return;
                }
            });
        }
    });
}

/**
 * 核实外部订单号的唯一性
 * @param
 *      query   请求串Obj
 *      retf    返回校验结果 True 合法|False 不合法
 * */
function checkChOrder(game, channel,attrs, query, retf){
    var isIllegal = false;
    logicCommon.selCHOrderInRedis(channel,query.oid,function(res){
        if(!res || typeof res == "undefined"){
            logicCommon.saveCHOrderInRedis(game, channel, query.doid, query.oid,function(res){
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
exports.CreateChannelOrder = CreateChannelOrder;
exports.checkChOrder = checkChOrder;