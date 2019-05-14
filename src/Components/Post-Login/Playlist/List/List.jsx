import React, { Component } from 'react'
import axios from 'axios'
import Song from '../Song/Song'
import OldSong from '../OldSong/OldSong'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { connect } from 'react-redux'
import io from 'socket.io-client'
require('dotenv').config()
const { REACT_APP_YOUTUBE_API_KEY } = process.env

class List extends Component {
  constructor(props) {
    super(props)
    this.state = {
      playlist: [],
      newVideoUrl: '',
      prevPlayed: [],
      nowPlaying: [],
      ready: false,
      urlError: false
    }
    this.socket = io.connect(':7777')
    this.socket.on('room response', data => {
      // console.log('room response')
      this.updatePlaylist()
    })

  }

  //SOCKETS

  broadcast = () => {
    this.socket.emit('broadcast to group socket', {
      group_id: this.props.group_id
    })
  }

  componentWillUnmount() {
    this.socket.disconnect()
  }

  //LOCAL METHODS

  async componentWillMount() {
    await this.updatePlaylist()
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevProps.next !== this.props.next) {
      this.broadcast()
      this.updatePlaylist()
    }
  }




  updatePlaylist = async () => {
    const { group_id } = this.props
    let res = await axios.post('/api/playlist', { group_id })
    let sortedArray = res.data.sort((a, b) => {
      const scoreA = a.score
      const scoreB = b.score
      if (scoreA < scoreB) {
        return 1
      } else {
        return -1
      }
    })

    let findPrev = await axios.post('/api/playlist/prev', { group_id })

    let prevPlayed = findPrev.data

    let videoIds1 = sortedArray.map(video => {
      return video.id
    })

    let videoIds2 = prevPlayed.map(video => {
      return video.id
    })

    let videoIds = [...videoIds1, ...videoIds2]


    let searchString = videoIds.join('%2C')

    let videoData = await axios.get(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${searchString}&key=${REACT_APP_YOUTUBE_API_KEY}`)

    sortedArray.forEach(video => {
      let details = videoData.data.items.find(element => element.id === video.id)
      video.details = details
    })

    prevPlayed.forEach(video => {
      let details = videoData.data.items.find(element => element.id === video.id)
      video.details = details
    })

    let nowPlaying = sortedArray.splice(0, 1)

    if (nowPlaying !== this.state.nowPlaying) {

      let nowPlayingVote = nowPlaying[0]

      if (nowPlayingVote) {
        await (axios.post('/api/playlist/vote', { playlistId: nowPlayingVote.group_playlist_id, vote: 9999 }))

        this.setState({
          nowPlaying: nowPlaying,
          playlist: sortedArray,
          prevPlayed: prevPlayed,
          ready: true
        })

      } else {
        this.setState({
          ready: false,
          prevPlayed: prevPlayed,
          nowPlaying: [],
        })
      }
    }

    this.socket.emit('join group', {
      group_id
    })

    if (this.state.nowPlaying[0]) {
      document.title = `Playing: ${this.state.nowPlaying[0].details.snippet.title}`
    } else {
      document.title = `vote 2 play`
    }
  }

  handleNewVideoFormChange = (e) => {
    this.setState({
      [e.target.name]: e.target.value
    })
  }

  handleAddNewVideoFormSubmit = async (e) => {
    e.preventDefault()
    const { group_id } = this.props
    await axios.post('/api/playlist/addsong', { group_id: group_id, songUrl: this.state.newVideoUrl })

    this.setState({
      newVideoUrl: ''
    })

    this.updatePlaylist()

    if (this.state.playlist.length === 0) {
      this.props.getPlaylist()
    }

    this.broadcast()
  }

  getPlaylistConditional = () => {
    if (this.state.nowPlaying.length === 0) {
      this.props.getPlaylist()
    }
  }



  render() {

    let playlist = this.state.playlist.filter(song => {
      if (song.details !== undefined) {
        return true
      } else {
        axios.delete(`/api/playlist/${song.group_playlist_id}`)
        axios.delete(`/api/playlist/song/${song.song_id}`)
        return false
      }
    }).map(song => {
      return <Song key={song.group_playlist_id}
        data={song.details.snippet}
        playlistId={song.group_playlist_id}
        songId={song.song_id}
        score={song.score}
        updatePlaylist={this.updatePlaylist}
        title={song.details.snippet.localized.title}
        broadcast={this.broadcast}
        isHost={this.props.isHost}
        login_id={this.props.login_id}
      />
    })

    let previouslyPlayed = this.state.prevPlayed.map(song => {
      let { snippet } = song.details
      return <OldSong updatePlaylist={this.updatePlaylist}
        data={song}
        key={song.id}
        title={snippet.title}
        getPlaylistConditional={this.getPlaylistConditional}
        broadcast={this.broadcast}
        isHost={this.props.isHost} />
    })

    let nowPlaying = this.state.nowPlaying[0]

    return (
      <div className='List'>
        {this.state.ready &&
          <div className='now-playing-hold'><h1>
            <span className="now-playing-text">
              NOW PLAYING:
          </span>

          </h1>
            <h1 className='now-playing-title'>{nowPlaying.details.snippet.title}</h1>
          </div>}
        <div className="white-line-playlist"></div>

        {this.state.ready ? 
        <div className='playlist'>
          <div>
            <h1 className='now-playing-text'>UP NEXT:</h1>

            {playlist}

          </div>

          <div className="previously-played">
            <div>
              <h1 className='previously-played-text'>Previously Played: </h1>
              {previouslyPlayed}
            </div>
            <form onSubmit={this.handleAddNewVideoFormSubmit}>
              <input type="url"
                name='newVideoUrl'
                onChange={this.handleNewVideoFormChange}
                value={this.state.newVideoUrl}
                placeholder='Add new song'
                className='add-song-input' />

              <button className='add-song-button'>

                <FontAwesomeIcon icon='plus-circle' />

              </button>
            </form>

            {this.state.urlError && <p>Error adding song, please try again</p>}
          </div>
        </div> : <img src='https://upload.wikimedia.org/wikipedia/commons/a/ad/YouTube_loading_symbol_3_%28transparent%29.gif' alt='loading gif' />}
      </div>
    )
  }
}

const mapStateToProps = (reduxStore) => {
  return {
    group_id: reduxStore.group.group_id,
    login_id: reduxStore.users.login_id
  }
}

export default connect(mapStateToProps)(List)