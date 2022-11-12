import { sleep } from "@perp/common/build/lib/helper"
import { Log } from "@perp/common/build/lib/loggers"
import { BotService } from "@perp/common/build/lib/perp/BotService"
import { AmountType, Side } from "@perp/common/build/lib/perp/PerpService"
import Big from "big.js"
import { Service } from "typedi"
const notifier = require('node-notifier');

import config from "../configs/config.json"
const player = require('play-sound')()
import axios from 'axios';
const nodemailer = require("nodemailer");

interface Market {
    name: string
    baseToken: string
    poolAddr: string
    ftxSizeIncrement: Big
    // config
    ftxMarketName: string
    orderAmount: Big
    // spread
    shortTriggerSpread: Big
    longTriggerSpread: Big
    // reduce mode
    isEmergencyReduceModeEnabled: boolean
    // balance routine
    imbalanceStartTime: number | null,
    symbol: string
}

@Service()
export class Arbitrageur extends BotService {
    readonly log = Log.getLogger(Arbitrageur.name)
    private marketMap: { [key: string]: Market } = {}

    async setup(): Promise<void> {
        this.log.jinfo({
            event: "SetupArbitrageur",
        })
        await this.createMarketMap()
    }

    async createMarketMap() {
        const poolMap: { [keys: string]: any } = {}
        for (const pool of this.perpService.metadata.pools) {
            poolMap[pool.baseSymbol] = pool
        }
        for (const [marketName, market] of Object.entries(config.MARKET_MAP)) {
            if (!market.IS_ENABLED) {
                continue
            }
            const pool = poolMap[marketName]
            // const ftxMarket = await this.ftxService.getMarket(market.FTX_MARKET_NAME)
            this.marketMap[marketName] = {
                name: marketName,
                baseToken: pool.baseAddress,
                poolAddr: pool.address,
                ftxSizeIncrement: Big(0.1),
                // ftxSizeIncrement: ftxMarket.sizeIncrement,
                // config
                ftxMarketName: market.FTX_MARKET_NAME,
                orderAmount: Big(market.ORDER_AMOUNT),
                // spread
                shortTriggerSpread: Big(market.SHORT_TRIGGER_SPREAD),
                longTriggerSpread: Big(market.LONG_TRIGGER_SPREAD),
                // emergency reduce mode
                isEmergencyReduceModeEnabled: market.IS_EMERGENCY_REDUCE_MODE_ENABLED,
                // balance routine
                imbalanceStartTime: null,
                symbol: market.SYMBOL
            }
        }
    }

    async start(): Promise<void> {
        console.log("Start Arbitrage")
        // this.ethService.enableEndpointRotation()
        notifier.notify('Start Arbitrage');

        let transporter = nodemailer.createTransport({
            service: 'gmail',
            host: 'smtp.gmail.com',
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
              user: "thangnv312@gmail.com",
              
            },
          });
        
          var mailOptions = {
            from: 'thangnv312@gmail.com',
            to: 'nvtcp9x@gmail.com,thangnv312@gmail.com,Hathanh163@gmail.com,Phanman1701@gmail.com',
            subject: 'TEST ShortArbitrage!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
            text: 'Please unspam me!!!'
            // text: 'ShortArbitrage ' + market.name + ' Perp Price: ' + +perpShortAvgPrice + '$ and Binance Price: ' + +binancePrice + "$"
          };
          
          transporter.sendMail(mailOptions, function(error: any, info: any){
            if (error) {
              console.log(error);
            } else {
              console.log('Email sent: ' + info.response);
            }
          });  
        this.arbitrageRoutine()
        
    }

    async arbitrageRoutine() {
        while (true) {
            await Promise.all(
                Object.values(this.marketMap).map(async market => {
                    try {
                        await this.arbitrage(market)
                    } catch (err: any) {
                        // await this.jerror({ event: "ArbitrageError", params: { err } })
                    }
                }),
            )
            await sleep(config.PRICE_CHECK_INTERVAL_SEC * 1000)
        }
    }

    async getAvgPrice(market: Market, side: Side, openOrderAmount: Big) {
        const swapResp = await this.perpService.quote(market.baseToken, side, AmountType.QUOTE, openOrderAmount, Big(0))
        return swapResp.deltaAvailableQuote.div(swapResp.deltaAvailableBase)
    }

    async arbitrage(market: Market) {
        // spread
        const orderAmount = market.orderAmount
        const [res, perpLongAvgPrice, perpShortAvgPrice] = await Promise.all([
            axios.get('https://api.binance.com/api/v3/ticker/price?symbol='+market.symbol),
            this.getAvgPrice(market, Side.LONG, orderAmount),
            this.getAvgPrice(market, Side.SHORT, orderAmount),
        ])
        const binancePrice = +res.data.price

        const curShortSpread = perpShortAvgPrice.minus(binancePrice).div(binancePrice)
        const curLongSpread = perpLongAvgPrice.minus(binancePrice).div(binancePrice)

        console.log("binancePrice: ", market.symbol, binancePrice)
        console.log("perpShortAvgPrice: ", +perpShortAvgPrice)
        console.log("perpLongAvgPrice: ", +perpLongAvgPrice)

        if (curShortSpread.gt(market.shortTriggerSpread)) {
            // short
            player.play('./alarm.mp3', () => {})
            notifier.notify("ShortArbitrage!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
            console.log("ShortArbitrage!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!: ", market.name)
            console.log("BINANCE PRICE: ", +binancePrice)
            console.log("PERP PRICE: ", +perpShortAvgPrice)
            let transporter = nodemailer.createTransport({
                service: 'gmail',
                host: 'smtp.gmail.com',
                port: 587,
                secure: false, // true for 465, false for other ports
                auth: {
                  user: "thangnv312@gmail.com",
                  
                },
              });
            
              var mailOptions = {
                from: 'thangnv312@gmail.com',
                to: 'nvtcp9x@gmail.com,thangnv312@gmail.com,Hathanh163@gmail.com,Phanman1701@gmail.com',
                subject: 'ShortArbitrage!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
                text: 'ShortArbitrage ' + market.name + ' Perp Price: ' + +perpShortAvgPrice + '$ and Binance Price: ' + +binancePrice + "$"
              };
              
              transporter.sendMail(mailOptions, function(error: any, info: any){
                if (error) {
                  console.log(error);
                } else {
                  console.log('Email sent: ' + info.response);
                }
              });  
           
        } else if (curLongSpread.lt(market.longTriggerSpread)) { 
            player.play('./alarm.mp3', () => {})
            notifier.notify("LongArbitrage!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! ");
            console.log("LongArbitrage!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!: ", market.name)
            console.log("BINANCE PRICE: ", +binancePrice)
            console.log("PERP PRICE: ", +perpLongAvgPrice)

            const maillist = [
                
              ];

            let transporter = nodemailer.createTransport({
                service: 'gmail',
                host: 'smtp.gmail.com',
                port: 587,
                secure: false, // true for 465, false for other ports
                auth: {
                  user: "thangnv312@gmail.com",
                  
                },
              });
            
              var mailOptions = {
                from: 'thangnv312@gmail.com',
                to: 'nvtcp9x@gmail.com,thangnv312@gmail.com,Hathanh163@gmail.com,Phanman1701@gmail.com',
                subject: 'LongArbitrage!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
                text: 'LongArbitrage ' + market.name + ' Perp Price: ' + +perpLongAvgPrice + '$ and Binance Price: ' + +binancePrice + "$"
              };
              
              transporter.sendMail(mailOptions, function(error: any, info: any){
                if (error) {
                  console.log(error);
                } else {
                  console.log('Email sent: ' + info.response);
                }
              });  
        } else {
            this.log.jinfo({ event: "NotTriggered", params: { market: market.name } })
        }
    }
}
