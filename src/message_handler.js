const { TeamSpeakClient } = require("node-ts");
const path = require('path');
const {
	sendChannelMessage,
	championMastery,
	getSummonerId,
	getChampionsMap,
	getCurrentMatch,
	getLeague,
    getAccountId,
    getMatchById,
    getMatchListById,
	processLineByLine,
	getSrcPath,
	appendToFile,
	writeFile,
	replaceInFile,
	setProperty,
	getProperty,
    isYouTubeLink
} = require('./utils');
const propertiesPath = path.join(getSrcPath(), 'leagueFiles', 'properties');
const leagueFilesPath = path.join(getSrcPath(), 'leagueFiles');
const Hangman = require('./hangman');
const LeagueJS = require('./league-api');
const Covid = require('./covid19-api');
LeagueJS.updateRateLimiter({allowBursts: true});

const Playlist = require("./playlist");
const youtube = require('./youtube-api');

function addToPlaylist(title, invokerName, client) {
    if(isYouTubeLink(title)) {
        youtube.getVideo(title).then((result) => {
            let title = result.title;
            Playlist.add(`https://youtu.be/${result.id}`, invokerName, title);
            console.log(invokerName, 'added', title, 'to the playlist');
            sendChannelMessage(client, invokerName +  ' added ' + title + ' to the playlist');
        }).catch(e => {
            console.error(e);
            sendChannelMessage(client, 'YoutubeApi error');
        })
    } else {
        youtube.searchVideos(title, 1).then((result) => {
            let title = result[0].title;
            Playlist.add(result[0].url, invokerName, title);
            console.log(invokerName, 'added', title, 'to the playlist');
            sendChannelMessage(client, invokerName +  ' added ' + title + ' to the playlist');
        }).catch(e => {
            console.error(e);
            sendChannelMessage(client, 'YoutubeApi error');
        });
    }
}

module.exports = {
	/**
	 * @param {TeamSpeakClient} client
	 * @param {TextMessageNotificationData} message
	 * */
	handleChannelMessage(client, message) {
		let {msg, invokername, invokerid} = message;
		msg = msg.toString().trim();
		console.log(`Message received from ${invokername}[${invokerid}]: ${msg}`);

		if( !msg.startsWith('!') )//not a command
			return;

		let [cmd, ...args] = msg.substring(1).split(' ');
        switch(cmd.toLowerCase()) {
			default:
				sendChannelMessage(client, 'Unknown command: ' + msg);
				break;
			case 'sr': {// song request
                let song;
				if (args.length < 1) {
					sendChannelMessage(client, 'You need to provide the link to youtube or the title of the song.');
					break;
				}

				else if(args.length === 1) {
                    // noinspection RegExpRedundantEscape
                    song = args[0].replace(/^\[URL\]/i, '')
                        .replace(/\[\/URL\]$/i, '');
                    addToPlaylist(song, invokername, client);
                    break;
                }

				else {
                    addToPlaylist(args.join(' '), invokername, client);
                    break;
                }
			}
			case 'skip': {//skip current song
				let currentInfo;
				if(Playlist.getCurrent()) {
					currentInfo = Playlist.getCurrent().title + ' requested by ' + Playlist.getCurrent().clientName;
				}
				if(Playlist.skipCurrent() === true) {
					sendChannelMessage(client, 'Skipping ' + currentInfo);
				}
				else {
					sendChannelMessage(client, 'Queue is empty')
				}
				break;
			}
			case 'skiplast': {//remove the most recent added song from queue
				if(Playlist.skipLast() === true ) {
					sendChannelMessage(client, 'Removed the most recent added song');
				}
				else {
					sendChannelMessage(client, 'Queue is empty');
				}
				break;
			}
            case 'current': {
            	if(!Playlist.getCurrent()) {
					sendChannelMessage(client, 'Nothing is playing right now');
				} else {
					sendChannelMessage(client, Playlist.getCurrent().title + ' requested by ' + Playlist.getCurrent().clientName);
				}
                break;
            }
			case 'previous': {
				if(!Playlist.getPrevious()) {
					sendChannelMessage(client, 'Cannot find previous song');
				} else {
					sendChannelMessage(client, Playlist.getPrevious().title + ' requested by ' + Playlist.getPrevious().clientName);
				}
				break;
			}

			case 'size': {
				sendChannelMessage(client, Playlist.getSize() + ' songs in the queue');
				break;
			}
			
	        case 'wisielec':
	        case 'hangman':
	        	Hangman.startGame(client, invokerid);
	        	break;

			case 'maestry':
			case 'mastery':
				if(args.length < 1) {
					sendChannelMessage(client, 'Summoner name missing');
					break;
				}
				else {
					championMastery(LeagueJS, args.join(' ')).then(data => {
						sendChannelMessage(client,
											'\n5 best champions of ' +
											args.join(' ') + '\n' +
											data.join('\n'));
					});
					break;
				}
			case 'live':
				(async () => {
					try {
						let summonerId = await getSummonerId(LeagueJS, args.join(' '));
						let activeMatch = await getCurrentMatch(LeagueJS, summonerId);
						try {
							sendChannelMessage(client, activeMatch.gameMode + ' ' + activeMatch.gameType);
							let team1 = [];
							let team2 = [];
							
							let championsMap = await getChampionsMap(LeagueJS);
							
							for (const summonerData of activeMatch.participants) {
								let leagueData = await getLeague(LeagueJS, summonerData.summonerId);
								
								let summonerName = summonerData.summonerName;
								let champion = '(' + championsMap.keys[summonerData.championId] + ')';
								let solo = 'SOLO: UNRANKED';
								let flex = 'FLEX: UNRANKED';
								let tft = 'TFT: UNRANKED';
								leagueData.forEach(queue => {
									if (queue.queueType.includes('SOLO')) solo = solo.replace('UNRANKED', queue.tier + ' ' + queue.rank + ' ' + queue.leaguePoints + ' LP' + ' (WR ' + Math.round((queue.wins / (queue.wins + queue.losses)) * 100) + '% ' + (queue.wins + queue.losses) + ' matches)');
									if (queue.queueType.includes('FLEX')) flex = flex.replace('UNRANKED', queue.tier + ' ' + queue.rank + ' ' + queue.leaguePoints + ' LP' + ' (WR ' + Math.round((queue.wins / (queue.wins + queue.losses)) * 100) + '% ' + (queue.wins + queue.losses) + ' matches)');
									if (queue.queueType.includes('TFT')) tft = tft.replace('UNRANKED', queue.tier + ' ' + queue.rank + ' ' + queue.leaguePoints + ' LP' + ' (WR ' + Math.round((queue.wins / (queue.wins + queue.losses)) * 100) + '% ' + (queue.wins + queue.losses) + ' matches)');
								});
								
								if (summonerData.teamId === 100) team1.push(summonerName.padEnd(20, ' ') + champion.padEnd(15, ' ') + solo.padEnd(50, ' ') + flex.padEnd(50, ' ') + tft.padEnd(50, ' '));
								else if (summonerData.teamId === 200) team2.push(summonerName.padEnd(20, ' ') + champion.padEnd(15, ' ') + solo.padEnd(50, ' ') + flex.padEnd(50, ' ') + tft.padEnd(50, ' '));
								if (team1.length + team2.length === activeMatch.participants.length) {
									sendChannelMessage(client, '\n' + team1.join('\n') + '\n' + ''.padStart(185, '-') + '\n' + team2.join('\n'));
									console.log(team1.join('\n') + '\n\n' + team2.join('\n'));
								}
								
							}
						}
						catch(err) {
							sendChannelMessage(client, 'Error: ' + JSON.parse(err.error).status.message + ' - summoner is not in game');
							console.error('Error: ' + JSON.parse(err.error).status.message + ' - summoner is not in game');
						}
					}
					catch(err) {
						try {
							let msg = JSON.parse(err.error).status.message;
							sendChannelMessage(client, 'Error: ' + msg);
							console.error('Error: ' + msg);
						} catch (e) {
							sendChannelMessage(client, err);
							console.error(err);
						}
					}
				})();
				break;
            case 'cs':
                (async () => {
					let summonerNameToCompare, csToCompare;
					let csComparePath = path.join(getSrcPath(), 'leagueFiles', 'cs-compare');
					try {
						const array = await processLineByLine(csComparePath);
						if (array !== undefined && array.length >= 1) {
							if (array.length === 1) summonerNameToCompare = array[0];
							else if (array.length === 2) {
								summonerNameToCompare = array[0];
								csToCompare = array[1];
							}
						}
					}
					catch(e) {
						console.error(e);
					}
                    const summonerNameFromArgs = args.join(' ');
                    let summonerNameExact;
                    let accountId = await getAccountId(LeagueJS, summonerNameFromArgs).catch(err => sendChannelMessage(client, err));
                    let matchList = await getMatchListById(LeagueJS, accountId).catch(err => sendChannelMessage(client, err));

                    let sum = 0, count = 0;
                    for(let match of matchList.matches) {
                        let res = await getMatchById(LeagueJS, match.gameId).catch(err => sendChannelMessage(client, err));
                        for(let index=0; index<res.participants.length; index++) {
                            if( match.role.includes('SUPPORT') )
                                continue;
                            if( res.participantIdentities[index].player.summonerName.toLowerCase() === summonerNameFromArgs.toLowerCase() ) {
                                if(summonerNameExact === undefined) summonerNameExact = res.participantIdentities[index].player.summonerName;
                                sum += Math.round(((res.participants[index].stats.totalMinionsKilled +
                                    res.participants[index].stats.neutralMinionsKilled) / (res.gameDuration / 60)) * 100) / 100;
                                count++;
                                break;
                            }
                        }
                    }
					let avgCs = Math.round((sum / count) * 100) / 100;
					if(summonerNameToCompare === undefined && csToCompare === undefined) {
						sendChannelMessage(client,`Average ${avgCs}cs/min in last ${count} not support games - ${summonerNameExact}.`);
					}
                    else if(summonerNameToCompare !== undefined && csToCompare === undefined) {
                    	if(summonerNameExact.toLowerCase() === summonerNameToCompare.toLowerCase()) {
							await replaceInFile(csComparePath, summonerNameToCompare, summonerNameExact).catch(err => { console.log(err); sendChannelMessage(client, err)});
                    		appendToFile(csComparePath, avgCs);
							sendChannelMessage(client,`Average ${avgCs}cs/min in last ${count} not support games - ${summonerNameExact}. Updated`);
						}
                    	else {
							sendChannelMessage(client,`Average ${avgCs}cs/min in last ${count} not support games - ${summonerNameExact}.`);
						}
					}
                    else if(summonerNameToCompare !== undefined && csToCompare !== undefined) {
						if(summonerNameExact.toLowerCase() === summonerNameToCompare.toLowerCase()) {
							await replaceInFile(csComparePath, csToCompare, avgCs).catch(err => { console.log(err); sendChannelMessage(client, err)});
							sendChannelMessage(client,`Average ${avgCs}cs/min in last ${count} not support games - ${summonerNameExact}. Updated`);
						}
						else {
							let diff = Math.round(Math.abs(avgCs - csToCompare) / ((Number(avgCs) + Number(csToCompare)) / 2) * 1000) / 10;
							sendChannelMessage(client,`Average ${avgCs}cs/min in last ${count} not support games - ${summonerNameExact}, it's ${diff}% ${avgCs > csToCompare ? 'better' : 'worse'} than ${summonerNameToCompare}! ${summonerNameToCompare} has average ${csToCompare}cs/min`);
						}
					}
                })();
                break;
            case 'covid':
              if(args.length < 1) {
                Covid.getAllCases().then(json => {
                  let message = '\n';
                  for(const key in json) {
                    message += `${key}: ${json[key]}\n`
                  }
                  sendChannelMessage(client, message);
                })
              }
              else {
                const country = args.join(' ');
                Covid.getCasesByCountry(country).then(json => {
                  let message = '\n';
                  for(const key in json) {
                    message += `${key}: ${json[key]}\n`
                  }
                  sendChannelMessage(client, message);
                })
              }
              break;
			case 'properties':
				processLineByLine(propertiesPath).then(res => {
					sendChannelMessage(client, '\n' + res.join('\n'));
					sendChannelMessage(client, 'To change property, use this syntax: !propertiesSet property value');
					sendChannelMessage(client, 'Example: !propertiesSet region eune');
				});
				break;
			case 'propertiesset':
				if(args.length < 2) {
					sendChannelMessage(client, `Invalid number of arguments, expected 2 or more, received ${args.length}`);
				} else {
					if(getProperty(propertiesPath, args[0]) !== null) {
						setProperty(propertiesPath, args[0], args.slice(1, args.length).join(' ')).then(res => {
							if(args[0].includes('csCompare')) {
								writeFile(path.join(leagueFilesPath, 'cs-compare'), args.slice(1, args.length).join(' '));
							}
							console.log(`Changed property. Properties are now:\n${res}`);
							sendChannelMessage(client,`Changed property. Properties are now:\n${res}`);
						});
					}
					else {
						sendChannelMessage(client, `Error: '${args[0]}' property cannot be found in the properties file.`);
						console.error(`Error: '${args[0]}' property cannot be found in the properties file.`);
					}
				}
				break;
		}
	},
	
	/**
	 * @param {TeamSpeakClient} client
	 * @param {TextMessageNotificationData} message
	 * */
	handlePrivateMessage(client, message) {
		let {msg, invokername, invokerid} = message;
		msg = msg.toString().trim();
		console.log(`Private message received from ${invokername}[${invokerid}]: ${msg}`);
		
		let [cmd/*, ...args*/] = msg.substring(1).split(' ');
		
		switch(cmd.toLowerCase()) {
			default:
				Hangman.onPrivateMessage(invokerid, msg);
				break;
			case 'wisielec':
	        case 'hangman':
	        	Hangman.startGame(client, invokerid);
	        	break;
		}
	}
};
